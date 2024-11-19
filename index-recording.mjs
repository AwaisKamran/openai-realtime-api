import recorder from 'node-record-lpcm16';
import fs from 'fs';

// Start recording from the microphone and pipe the output to a writable stream
const file = fs.createWriteStream('recording/output.wav', { encoding: 'binary' });

recorder
.record({
    sampleRate: 44100,   // Sample rate in Hz (default: 16000)
    threshold: 0.5,      // Threshold for noise reduction
    verbose: true        // Log info
})
.stream()
.pipe(file);

console.log('Recording... Press Ctrl+C to stop.');