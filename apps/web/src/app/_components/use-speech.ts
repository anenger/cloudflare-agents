"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Minimal Web Speech API types (not yet in TypeScript's DOM lib).
type RecognitionResultList = ArrayLike<{
	0: { transcript: string };
	isFinal: boolean;
}>;
type Recognition = {
	continuous: boolean;
	interimResults: boolean;
	lang: string;
	start(): void;
	stop(): void;
	onresult: ((e: { results: RecognitionResultList }) => void) | null;
	onend: (() => void) | null;
	onerror: ((e: { error: string }) => void) | null;
};
type RecognitionCtor = new () => Recognition;

function getRecognition(): RecognitionCtor | null {
	if (typeof window === "undefined") return null;
	const w = window as unknown as {
		SpeechRecognition?: RecognitionCtor;
		webkitSpeechRecognition?: RecognitionCtor;
	};
	return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * Voice input via the browser's speech recognition. `onTranscript` gets the
 * full transcript of the current dictation each time it changes.
 */
export function useDictation(onTranscript: (text: string) => void) {
	const [supported, setSupported] = useState(false);
	const [listening, setListening] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const recognition = useRef<Recognition | null>(null);
	const callback = useRef(onTranscript);
	callback.current = onTranscript;

	useEffect(() => setSupported(getRecognition() !== null), []);

	const stop = useCallback(() => recognition.current?.stop(), []);

	const start = useCallback(() => {
		const Ctor = getRecognition();
		if (!Ctor) return;
		const r = new Ctor();
		r.continuous = true;
		r.interimResults = true;
		r.lang = navigator.language || "en-US";
		r.onresult = (e) => {
			let text = "";
			for (let i = 0; i < e.results.length; i++)
				text += e.results[i]?.[0].transcript ?? "";
			callback.current(text.trim());
		};
		r.onerror = (e) => {
			if (e.error !== "aborted" && e.error !== "no-speech") {
				setError(
					e.error === "not-allowed"
						? "Microphone access was blocked."
						: e.error,
				);
			}
		};
		r.onend = () => setListening(false);
		recognition.current = r;
		setError(null);
		setListening(true);
		r.start();
	}, []);

	useEffect(() => () => recognition.current?.stop(), []);

	return { supported, listening, error, start, stop };
}

const SPEAK_KEY = "coach:speak";

/** Optional text-to-speech for the interviewer's questions. */
export function useSpeaker() {
	const [enabled, setEnabled] = useState(false);
	const [supported, setSupported] = useState(false);

	useEffect(() => {
		setSupported(typeof window !== "undefined" && "speechSynthesis" in window);
		try {
			setEnabled(localStorage.getItem(SPEAK_KEY) === "1");
		} catch {
			// Storage unavailable; keep default.
		}
	}, []);

	const toggle = useCallback(() => {
		setEnabled((on) => {
			const next = !on;
			try {
				localStorage.setItem(SPEAK_KEY, next ? "1" : "0");
			} catch {
				// ignore
			}
			if (!next) window.speechSynthesis?.cancel();
			return next;
		});
	}, []);

	const speak = useCallback(
		(text: string) => {
			if (!enabled || !supported) return;
			window.speechSynthesis.cancel();
			window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
		},
		[enabled, supported],
	);

	useEffect(() => () => window.speechSynthesis?.cancel(), []);

	return { enabled, supported, toggle, speak };
}
