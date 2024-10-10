import fs from 'fs';
import dotenv from 'dotenv';
import WebSocket from "ws";
import readline from 'readline';
import decodeAudio from 'audio-decode';
import Speaker from 'speaker';

dotenv.config();

const RESPONSE_TYPE_DELTA = "response.audio.delta"
const RESPONSE_TYPE_CONTENT_PART_DONE = "response.content_part.done"
const RESPONSE_TYPE_DONE = "response.done"
let audioCounter = 1;

/* Define the audio format (PCM) & Empty Buffer */
let audioBuffer = Buffer.alloc(0); 

const speaker = new Speaker({
    channels: 1,          // 2 channels (stereo)
    bitDepth: 16,          // 16-bit samples
    sampleRate: 24000,     // 44,100 Hz sample rate
});

/* Utility Methods */
const floatTo16BitPCM = (float32Array) => {
    const buffer = new ArrayBuffer(float32Array.length * 2);
    const view = new DataView(buffer);
    let offset = 0;
    for (let i = 0; i < float32Array.length; i++, offset += 2) {
      let s = Math.max(-1, Math.min(1, float32Array[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
    return buffer;
}

const base64EncodeAudio = (float32Array) => {
    const arrayBuffer = floatTo16BitPCM(float32Array);
    let binary = '';
    let bytes = new Uint8Array(arrayBuffer);
    const chunkSize = 0x8000; // 32KB chunk size
    for (let i = 0; i < bytes.length; i += chunkSize) {
      let chunk = bytes.subarray(i, i + chunkSize);
      binary += String.fromCharCode.apply(null, chunk);
    }
    return btoa(binary);
}
  

/* Callback method */
const startConversation = async () => {
    console.log("Starting conversation thread ...")
    const myAudio = fs.readFileSync(`./audio/audio-${audioCounter}.wav`);
    const audioBuffer = await decodeAudio(myAudio);
    const channelData = audioBuffer.getChannelData(0);
    const base64AudioData = base64EncodeAudio(channelData);

    ++audioCounter;

    if(audioCounter > 5) {
        console.log("Exiting ...")
        speaker.end();
        return;
    }

    console.log("Sending client event.")

    /* Send Client Event */
    ws.send(JSON.stringify({
        type: "conversation.item.create",
        item: {
            type: 'message',
            role: 'user',
            content: [
              {
                type: 'input_audio',
                audio: base64AudioData
              }
            ]
          }
    })); 
    ws.send(JSON.stringify({type: 'response.create'}));
    console.log("Client event sent.")
}

const incomingMessage = (message) => {
    try{
        const response = JSON.parse(message.toString());
        if(response.type === RESPONSE_TYPE_DELTA) {
            const audioChunk = Buffer.from(response.delta, 'base64');
            audioBuffer = Buffer.concat([audioBuffer, audioChunk]);
            speaker.write(audioChunk); 
        }
        else if(response.type === RESPONSE_TYPE_DONE) {
            startConversation()
        }
        else if (response.type === RESPONSE_TYPE_CONTENT_PART_DONE){
            const { part } = response;
            console.log(part.transcript);
            console.log("\n")
        }
    }
    catch(ex){
        console.error(ex.toString)
    }
}

/* Socket Initialization */
const url = "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01";
const ws = new WebSocket(url, {
    headers: {
        "Authorization": "Bearer " + process.env.OPENAI_API_KEY,
        "OpenAI-Beta": "realtime=v1",
        "OpenAI-Project": process.env.PROJECT
    },
});

ws.onerror = function (error) {
    console.error('WebSocket Error: ', error.message);
};

ws.on("open", function open() {
    console.log("Connected to server.");
    startConversation()
});

ws.on("message", incomingMessage);
