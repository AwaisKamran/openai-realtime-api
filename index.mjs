import dotenv from 'dotenv';
import WebSocket from "ws";
import readline from 'readline';

dotenv.config();

const RESPONSE_TYPE_DELTA = "response.text.delta"
const RESPONSE_TYPE_DONE = "response.text.done"
let data = ""

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

/* Callback method */
const startConversation = () => {
    rl.question('Enter your prompt here: ', (prompt) => {        
        /* Send Client Event */
        ws.send(JSON.stringify({
            type: "response.create",
            response: {
                modalities: ["text"],
                instructions: `You are a high school math tutor, help the user with this questions - ${prompt}.`,
            }
        }));
    });  
}

const incomingMessage = (message) => {
    try{
        const response = JSON.parse(message.toString());
        if(response.type === RESPONSE_TYPE_DELTA) {
            const { delta } = response
            data += delta;
        }
        else if(response.type === RESPONSE_TYPE_DONE) {
            console.log(data);
            console.log("\n")
            data = ""
            startConversation()
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
