import fs from 'fs';
import dotenv from 'dotenv';
import WebSocket from "ws";
import Speaker from 'speaker';
import recorder from 'node-record-lpcm16';
import { PassThrough } from 'stream';
import wav from 'wav-decoder'; 

dotenv.config();
let audiofileCounter = 0;
process.stdin.setEncoding('utf-8');
const RESPONSE_TYPE_DELTA = "response.audio.delta"
const RESPONSE_TYPE_CONTENT_PART_DONE = "response.content_part.done"
const RESPONSE_TYPE_DONE = "response.done"

/* Define the audio format (PCM) & Empty Buffer */
let audioBuffer = Buffer.alloc(0); 
let recordingObject = null

let speaker = null;
let bufferStream = null;
createNewSpeaker();

/* Utility Methods */
function createNewSpeaker() {
    speaker = new Speaker({
        channels: 1,          
        bitDepth: 16,          
        sampleRate: 24000,   
    });

    bufferStream = new PassThrough();
    bufferStream.pipe(speaker);
}

function addAudioChunk(audioChunk) {
    bufferStream.write(audioChunk);
}

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
process.stdin.on('data', (input) => {
    const trimmedInput = input.trim().toLowerCase();
    if (trimmedInput === 's') {   
        const file = fs.createWriteStream(`recording/output-${++audiofileCounter}.wav`, { encoding: 'binary' });
        recordingObject =  recorder.record({
            sampleRate: 20000,   
            threshold: 0.5,
            verbose: true
        })
        .stream()
        .pipe(file);
        console.log('Recording...');
        console.log("Enter (q) to quit:")
    }
    else if(trimmedInput === 'q'){
        console.log('Stopping recording...');
        recordingObject.end();
        console.log("recording stopped!\n\n")
        startConversation()
    }
});

function recordAudio() {
    /* Listen for 's' key press to stop recording */
    console.log("Enter (s) to start:")
}

async function startConversation() {
    console.log("Starting conversation thread ...")
    const myAudio = fs.readFileSync(`./recording/output-${audiofileCounter}.wav`);
    const audioBuffer = await wav.decode(myAudio);
    const channelData = audioBuffer.channelData[0];
    const base64AudioData = base64EncodeAudio(channelData);

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
    ws.send(JSON.stringify({ type: 'response.create' }));
    console.log("Client event sent.")
}

function incomingMessage(message) {
    try{
        const response = JSON.parse(message.toString());
        if(response.type === RESPONSE_TYPE_DELTA) {
            const audioChunk = Buffer.from(response.delta, 'base64');
            audioBuffer = Buffer.concat([audioBuffer, audioChunk]);
            addAudioChunk(audioChunk);
        }
        else if(response.type === RESPONSE_TYPE_DONE) {
            killSpeaker();
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

function killSpeaker() {
    setTimeout(() =>{
        speaker.end();
        createNewSpeaker();
        recordAudio();
    }, 3000)
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
});

ws.on("message", incomingMessage);

recordAudio()
