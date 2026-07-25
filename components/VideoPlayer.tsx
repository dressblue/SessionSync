"use client";

import { useEffect, useRef, useState } from "react";
import type { VideoState } from "./useSessionState";

interface Props {
  video: VideoState;
  canControl: boolean;
  onControl: (action: "play" | "pause" | "restart", pos: number) => void;
}

// Position the facilitator's anchor implies right now.
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
  // Participants tap once to satisfy autoplay/audio gesture policies.
  const [armed, setArmed] = useState(canControl);
  const videoRef = useRef<HTMLVideoElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ytRef = useRef<any>(null);
  const ytDivRef = useRef<HTMLDivElement>(null);
  const isYouTube = video.provider === "youtube";

  const getPos = (): number => {
    if (isYouTube) return ytRef.current?.getCurrentTime?.() ?? 0;
    return videoRef.current?.currentTime ?? 0;
  };

  // ---- YouTube player lifecycle ----
  useEffect(() => {
    if (!isYouTube || !armed) return;
    let cancelled = false;
    loadYT().then(() => {
      if (cancelled || !ytDivRef.current) return;
      const w = window as unknown as { YT: any }; // eslint-disable-line @typescript-eslint/no-explicit-any
      ytRef.current = new w.YT.Player(ytDivRef.current, {
        videoId: video.ref,
        playerVars: { controls: canControl ? 1 : 0, disablekb: canControl ? 0 : 1, rel: 0, modestbranding: 1 },
        events: {
          onReady: () => applySync(),
          onStateChange: (e: { data: number }) => {
            if (!canControl) return;
            // 1 = playing, 2 = paused
            if (e.data === 1) onControl("play", getPos());
            else if (e.data === 2) onControl("pause", getPos());
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
  }, [isYouTube, armed, video.ref]);

  // ---- Sync participants to the facilitator's anchor ----
  function applySync() {
    if (canControl || !armed) return;
    const want = expectedPos(video);
    if (isYouTube) {
      const p = ytRef.current;
      if (!p?.getCurrentTime) return;
      if (Math.abs((p.getCurrentTime() ?? 0) - want) > 2.5) p.seekTo(want, true);
      const state = p.getPlayerState?.();
      if (video.playing && state !== 1) p.playVideo();
      if (!video.playing && state === 1) p.pauseVideo();
    } else {
      const el = videoRef.current;
      if (!el) return;
      if (isFinite(want) && Math.abs(el.currentTime - want) > 2.5) el.currentTime = want;
      if (video.playing && el.paused) el.play().catch(() => {});
      if (!video.playing && !el.paused) el.pause();
    }
  }

  // Re-sync whenever the anchor changes, and periodically to correct drift.
  useEffect(() => {
    applySync();
    if (canControl) return;
    const iv = setInterval(applySync, 3000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video.playing, video.t0, video.at, armed]);

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

  return (
    <div className="flex flex-col gap-3">
      <div className="relative w-full aspect-video rounded-lg overflow-hidden bg-black">
        {!armed ? (
          <button
            onClick={() => setArmed(true)}
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white bg-slate-900/80 hover:bg-slate-900/70"
          >
            <span className="w-14 h-14 rounded-full bg-white/90 text-slate-900 flex items-center justify-center text-2xl">
              ▶
            </span>
            <span className="text-sm font-medium">Tap to watch along</span>
            <span className="text-xs text-white/70">
              The facilitator controls playback
            </span>
          </button>
        ) : isYouTube ? (
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
      </div>

      {canControl && armed && (
        <div className="flex items-center gap-2">
          <button
            onClick={play}
            className="rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm font-semibold hover:bg-indigo-700"
          >
            ▶ Play for all
          </button>
          <button
            onClick={pause}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-100"
          >
            ❚❚ Pause all
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
    </div>
  );
}
