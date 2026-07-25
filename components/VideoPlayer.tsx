"use client";

import { useEffect, useRef, useState } from "react";
import type { VideoState } from "./useSessionState";

interface Props {
  video: VideoState;
  canControl: boolean;
  onControl: (
    action: "play" | "pause" | "restart" | "seek",
    pos: number
  ) => void;
}

const DRIFT_TOLERANCE = 1.5; // seconds before a participant re-seeks

function expectedPos(video: VideoState): number {
  if (!video.playing) return video.t0;
  const elapsed = (Date.now() - Date.parse(video.at)) / 1000;
  return Math.max(0, video.t0 + (isFinite(elapsed) ? elapsed : 0));
}

// ---- YouTube IFrame API loader (once) ----
let ytReady: Promise<void> | null = null;
function loadYT(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  const w = window as unknown as { YT?: { Player: unknown }; onYouTubeIframeAPIReady?: () => void };
  if (w.YT && w.YT.Player) return Promise.resolve();
  if (ytReady) return ytReady;
  ytReady = new Promise((resolve) => {
    const prev = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve();
    };
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(s);
  });
  return ytReady;
}

export function VideoPlayer({ video, canControl, onControl }: Props) {
  // When the video should be playing but this player is stalled/blocked
  // (browser autoplay policy), show a clear tap-to-play prompt.
  const [needsGesture, setNeedsGesture] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ytRef = useRef<any>(null);
  const ytDivRef = useRef<HTMLDivElement>(null);
  const isYouTube = video.provider === "youtube";

  const getPos = (): number => {
    if (isYouTube) return ytRef.current?.getCurrentTime?.() ?? 0;
    return videoRef.current?.currentTime ?? 0;
  };

  // ---- YouTube player lifecycle (created for everyone) ----
  useEffect(() => {
    if (!isYouTube) return;
    let cancelled = false;
    loadYT().then(() => {
      if (cancelled || !ytDivRef.current) return;
      const w = window as unknown as { YT: any }; // eslint-disable-line @typescript-eslint/no-explicit-any
      ytRef.current = new w.YT.Player(ytDivRef.current, {
        videoId: video.ref,
        playerVars: {
          controls: canControl ? 1 : 0,
          disablekb: canControl ? 0 : 1,
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
        },
        events: {
          onReady: () => applySync(),
          onStateChange: (e: { data: number }) => {
            if (canControl) {
              if (e.data === 1) onControl("play", getPos());
              else if (e.data === 2) onControl("pause", getPos());
            } else if (e.data === 1) {
              // participant is playing — clear any tap-to-play prompt
              setNeedsGesture(false);
            }
          },
        },
      });
    });
    return () => {
      cancelled = true;
      ytRef.current?.destroy?.();
      ytRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isYouTube, video.ref]);

  // ---- Sync participants to the facilitator's anchor ----
  // force=true seeks regardless of tolerance (manual catch-up / reconnect).
  function applySync(force = false) {
    if (canControl) return;
    const want = expectedPos(video);
    const tol = force ? 0.25 : DRIFT_TOLERANCE;
    if (isYouTube) {
      const p = ytRef.current;
      if (!p?.getCurrentTime) return;
      if (isFinite(want) && Math.abs((p.getCurrentTime() ?? 0) - want) > tol)
        p.seekTo(want, true);
      const state = p.getPlayerState?.();
      if (video.playing) {
        if (state !== 1) p.playVideo();
        // If it doesn't reach "playing" shortly, autoplay was blocked.
        window.setTimeout(() => {
          if (video.playing && ytRef.current?.getPlayerState?.() !== 1)
            setNeedsGesture(true);
        }, 900);
      } else {
        setNeedsGesture(false);
        if (state === 1) p.pauseVideo();
      }
    } else {
      const el = videoRef.current;
      if (!el) return;
      if (isFinite(want) && Math.abs(el.currentTime - want) > tol)
        el.currentTime = want;
      if (video.playing) {
        el.play()
          .then(() => setNeedsGesture(false))
          .catch(() => setNeedsGesture(true));
      } else {
        setNeedsGesture(false);
        if (!el.paused) el.pause();
      }
    }
  }

  // Re-sync on anchor change, frequently to correct drift, and hard on focus
  // / reconnect (covers drift after a temporary disconnect).
  useEffect(() => {
    applySync();
    if (canControl) return;
    const iv = setInterval(() => applySync(), 2000);
    const onFocus = () => applySync(true);
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("online", onFocus);
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(iv);
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("online", onFocus);
      window.removeEventListener("focus", onFocus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video.playing, video.t0, video.at]);

  // Participant taps the prompt: a real user gesture, so playback unlocks.
  const tapToPlay = () => {
    setNeedsGesture(false);
    if (isYouTube) ytRef.current?.playVideo?.();
    else videoRef.current?.play().catch(() => setNeedsGesture(true));
    applySync(true);
  };

  // ---- Facilitator transport ----
  const play = () => {
    if (isYouTube) ytRef.current?.playVideo?.();
    else videoRef.current?.play().catch(() => {});
    onControl("play", getPos());
  };
  const pause = () => {
    if (isYouTube) ytRef.current?.pauseVideo?.();
    else videoRef.current?.pause();
    onControl("pause", getPos());
  };
  const restart = () => {
    if (isYouTube) {
      ytRef.current?.seekTo?.(0, true);
      ytRef.current?.pauseVideo?.();
    } else if (videoRef.current) {
      videoRef.current.currentTime = 0;
      videoRef.current.pause();
    }
    onControl("restart", 0);
  };
  const syncAll = () => onControl("seek", getPos());

  return (
    <div className="flex flex-col gap-3">
      <div className="relative w-full aspect-video rounded-lg overflow-hidden bg-black">
        {isYouTube ? (
          <div ref={ytDivRef} className="w-full h-full" />
        ) : (
          <video
            ref={videoRef}
            src={video.ref}
            controls={canControl}
            playsInline
            className="w-full h-full"
          />
        )}

        {/* Participant tap-to-play prompt (autoplay blocked / behind) */}
        {!canControl && needsGesture && (
          <button
            onClick={tapToPlay}
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white bg-slate-900/75 hover:bg-slate-900/65"
          >
            <span className="w-16 h-16 rounded-full bg-white text-slate-900 flex items-center justify-center text-3xl shadow-lg">
              ▶
            </span>
            <span className="text-base font-semibold">Tap to play</span>
            <span className="text-xs text-white/80">
              Join the class — your browser needs a tap to start the video
            </span>
          </button>
        )}
      </div>

      {canControl && (
        <div className="flex flex-wrap items-center gap-2">
          {video.playing ? (
            <button
              onClick={pause}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-100"
            >
              ❚❚ Pause all
            </button>
          ) : (
            <button
              onClick={play}
              className="rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm font-semibold hover:bg-indigo-700"
            >
              ▶ Play for all
            </button>
          )}
          <button
            onClick={syncAll}
            title="Force every participant to jump to your current position"
            className="rounded-lg border border-indigo-300 text-indigo-700 px-3 py-2 text-sm font-medium hover:bg-indigo-50"
          >
            ⟲ Sync all to here
          </button>
          <button
            onClick={restart}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            ↺ Restart
          </button>
          <span className="text-xs text-slate-400 ml-1">
            {video.playing ? "Playing on every screen" : "Paused"}
          </span>
        </div>
      )}

      {!canControl && (
        <button
          onClick={() => applySync(true)}
          className="self-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
        >
          ⟲ Catch up to the class
        </button>
      )}
    </div>
  );
}
