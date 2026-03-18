var audioContext = null
var clickBuffer = null
var isPlaying = false // Are we currently playing?
var startTime // The start time of the entire sequence.
var currentTwelveletNote // What note is currently last scheduled?
var tempo = 120.0 // tempo (in beats per minute)
var meter = 4
var masterVolume = 0.5
var accentVolume = 1
var quarterVolume = 0.75
var eighthVolume = 0
var sixteenthVolume = 0
var tripletVolume = 0
var lookahead = 25.0 // How frequently to call scheduling function
//(in milliseconds)
var scheduleAheadTime = 0.1 // How far ahead to schedule audio (sec)
// This is calculated from lookahead, and overlaps
// with next interval (in case the timer is late)
var nextNoteTime = 0.0 // when the next note is due.
var noteLength = 0.035 // length of "click" (in seconds)
var notesInQueue = [] // the notes that have been put into the web audio,
// and may or may not have played yet. {note, time}
var timerWorker = null // The Web Worker used to fire timer messages

function createClickBuffer() {
	var bufferSize = audioContext.sampleRate * 0.003 // 3ms of noise for attack
	var buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate)
	var data = buffer.getChannelData(0)

	// Fill with white noise for the attack click
	for (var i = 0; i < bufferSize; i++) {
		data[i] = Math.random() * 2 - 1
	}

	return buffer
}

function maxBeats() {
	var beats = meter * 12
	return beats
}

function nextTwelvelet() {
	var secondsPerBeat = 60.0 / tempo
	nextNoteTime += 0.08333 * secondsPerBeat // Add beat length to last beat time
	currentTwelveletNote++ // Advance the beat number, wrap to zero

	if (currentTwelveletNote == maxBeats()) {
		currentTwelveletNote = 0
	}
}

function calcVolume(beatVolume) {
	return beatVolume * masterVolume
}

function scheduleNote(beatNumber, time) {
	// push the note on the queue, even if we're not playing.
	notesInQueue.push({ note: beatNumber, time: time })

	// Determine frequency and volume based on beat type
	var frequency = 0
	var volume = 0

	if (beatNumber % maxBeats() === 0) {
		if (accentVolume > 0.25) {
			frequency = 880.0
			volume = calcVolume(accentVolume)
		} else {
			frequency = 440.0
			volume = calcVolume(quarterVolume)
		}
	} else if (beatNumber % 12 === 0) {
		frequency = 440.0
		volume = calcVolume(quarterVolume)
	} else if (beatNumber % 6 === 0) {
		frequency = 440.0
		volume = calcVolume(eighthVolume)
	} else if (beatNumber % 4 === 0) {
		frequency = 300.0
		volume = calcVolume(tripletVolume)
	} else if (beatNumber % 3 === 0) {
		frequency = 220.0
		volume = calcVolume(sixteenthVolume)
	} else {
		volume = 0 // keep the remaining twelvelet notes inaudible
	}

	if (volume > 0) {
		// Create tonal component with pitch
		var osc = audioContext.createOscillator()
		var oscGain = audioContext.createGain()

		osc.type = 'sine'
		osc.frequency.value = frequency

		osc.connect(oscGain)
		oscGain.connect(audioContext.destination)

		// Sharp exponential decay for crisp click
		oscGain.gain.setValueAtTime(volume * 0.7, time)
		oscGain.gain.exponentialRampToValueAtTime(0.01, time + noteLength)

		osc.start(time)
		osc.stop(time + noteLength)

		// Add brief noise click for attack
		var noiseSource = audioContext.createBufferSource()
		var noiseGain = audioContext.createGain()
		var noiseFilter = audioContext.createBiquadFilter()

		noiseSource.buffer = clickBuffer

		// Band-pass filter for warmer attack
		noiseFilter.type = 'bandpass'
		noiseFilter.frequency.value = 1200
		noiseFilter.Q.value = 1.0

		noiseSource.connect(noiseFilter)
		noiseFilter.connect(noiseGain)
		noiseGain.connect(audioContext.destination)

		// Very brief noise burst
		noiseGain.gain.setValueAtTime(volume * 0.2, time)
		noiseGain.gain.exponentialRampToValueAtTime(0.01, time + 0.008)

		noiseSource.start(time)
		noiseSource.stop(time + 0.008)
	}
}

function scheduler() {
	while (nextNoteTime < audioContext.currentTime + scheduleAheadTime) {
		scheduleNote(currentTwelveletNote, nextNoteTime)
		nextTwelvelet()
	}
}

function play() {
	isPlaying = !isPlaying

	if (isPlaying) {
		currentTwelveletNote = 0
		nextNoteTime = audioContext.currentTime
		timerWorker.postMessage("start")
		document.getElementById("buttonIcon").src = "assets/img/pause-icon.svg"
	} else {
		timerWorker.postMessage("stop")
		document.getElementById("buttonIcon").src = "assets/img/play-icon.svg"
	}
}

function init() {
	audioContext = new AudioContext()
	clickBuffer = createClickBuffer()
	timerWorker = new Worker("assets/js/worker.js")

	timerWorker.onmessage = function (e) {
		if (e.data == "tick") {
			scheduler()
		} else {
			console.log("message: " + e.data)
		}
	}

	timerWorker.postMessage({ interval: lookahead })
}

window.addEventListener("load", init)
