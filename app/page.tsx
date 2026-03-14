"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { upload } from "@vercel/blob/client";

type Phase = "landing" | "recording" | "uploading" | "done" | "error";

const RECORD_DURATION = 3 * 60; // 3 minutes in seconds

export default function Home() {
  const [phase, setPhase] = useState<Phase>("landing");
  const [errorMsg, setErrorMsg] = useState("");

  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const uploadChunks = useCallback(async () => {
    if (chunksRef.current.length === 0) return;
    try {
      const blob = new Blob(chunksRef.current, { type: "video/webm" });
      const filename = `reaction-${Date.now()}.webm`;
      await upload(filename, blob, {
        access: "public",
        handleUploadUrl: "/api/upload",
      });
    } catch (err) {
      console.error("Upload failed:", err);
    }
  }, []);

  // Save recording when user leaves/closes the page
  useEffect(() => {
    const handleBeforeUnload = () => {
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        recorder.stop();
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      // Use sendBeacon as a last-resort fire-and-forget upload
      if (chunksRef.current.length > 0) {
        const blob = new Blob(chunksRef.current, { type: "video/webm" });
        const formData = new FormData();
        formData.append("file", blob, `reaction-${Date.now()}.webm`);
        navigator.sendBeacon("/api/beacon-upload", formData);
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        const recorder = mediaRecorderRef.current;
        if (recorder && recorder.state !== "inactive") {
          recorder.stop();
          if (streamRef.current) {
            streamRef.current.getTracks().forEach((t) => t.stop());
          }
          if (timerRef.current) clearInterval(timerRef.current);
          uploadChunks();
        }
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (timerRef.current) clearInterval(timerRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, [uploadChunks]);

  const stopAndUpload = useCallback(async () => {
    if (timerRef.current) clearInterval(timerRef.current);

    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") return;

    // Wait for the recorder to finish writing remaining data
    await new Promise<void>((resolve) => {
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => resolve();
      recorder.stop();
    });

    // Stop camera
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
    }

    setPhase("uploading");

    try {
      await uploadChunks();
      setPhase("done");
    } catch (err) {
      console.error("Upload failed:", err);
      setErrorMsg("Upload failed. Please try again.");
      setPhase("error");
    }
  }, [uploadChunks]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      streamRef.current = stream;

      // Show webcam preview
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      // Start recording
      const recorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
          ? "video/webm;codecs=vp9"
          : "video/webm",
      });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.start(1000); // collect data every second
      setPhase("recording");

      // Stop after 3 minutes
      let elapsed = 0;
      timerRef.current = setInterval(() => {
        elapsed++;
        if (elapsed >= RECORD_DURATION) {
          stopAndUpload();
        }
      }, 1000);
    } catch {
      setErrorMsg(
        "Camera access is required to continue. Please allow camera access and try again."
      );
      setPhase("error");
    }
  };

  return (
    <div className="container">
      {phase === "landing" && (
        <div className="landing">
          <button className="start-btn" onClick={startRecording}>
            I&apos;m Ready
          </button>
        </div>
      )}

      {phase === "recording" && (
        <div className="recording-screen">
          <div className="recording-indicator">
            <span className="rec-dot" />
            <span>Recording your reaction</span>
          </div>

          <div className="video-wrapper">
            <iframe
              src="https://www.youtube.com/embed/sh3g6YIeul0?autoplay=1&rel=0"
              title="Video"
              allow="autoplay; encrypted-media"
              allowFullScreen
            />
          </div>

          {/* Webcam preview PiP */}
          <div className="webcam-preview">
            <video ref={videoRef} autoPlay muted playsInline />
          </div>
        </div>
      )}

      {phase === "uploading" && (
        <div className="status-screen">
          <h2>Uploading your reaction...</h2>
          <div className="spinner" />
          <p>Please wait, this may take a moment.</p>
        </div>
      )}

      {phase === "done" && (
        <div className="status-screen">
          <div className="checkmark">&#10003;</div>
          <h2>All done!</h2>
          <p>Thanks for watching. Your reaction has been saved.</p>
        </div>
      )}

      {phase === "error" && (
        <div className="status-screen">
          <h2>Oops</h2>
          <p className="error">{errorMsg}</p>
          <button
            className="start-btn"
            style={{ marginTop: "1.5rem" }}
            onClick={() => {
              setPhase("landing");
              setErrorMsg("");
            }}
          >
            Try Again
          </button>
        </div>
      )}
    </div>
  );
}
