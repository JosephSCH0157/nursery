import React, { useEffect, useLayoutEffect, useRef, useState } from "react";

void React;

export type OscilloscopeFillProps = {
  stream: MediaStream | null;
  active: boolean;
};

export default function OscilloscopeFill({
  stream,
  active,
}: OscilloscopeFillProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const [size, setSize] = useState({ w: 1, h: 1 });

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const ro = new ResizeObserver(() => {
      const r = host.getBoundingClientRect();
      const w = Math.max(1, Math.floor(r.width));
      const h = Math.max(1, Math.floor(r.height));
      setSize({ w, h });
    });

    ro.observe(host);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !active || !stream) return;

    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) return;

    const AudioCtx = window.AudioContext || (window as Window & typeof globalThis & {
      webkitAudioContext?: typeof AudioContext;
    }).webkitAudioContext;
    if (!AudioCtx) return;
    const audioCtx = new AudioCtx();
    audioCtxRef.current = audioCtx;

    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.85;
    source.connect(analyser);

    const bufferLength = analyser.fftSize;
    const data = new Uint8Array(bufferLength);
    const computed = getComputedStyle(canvas);
    const stroke = computed.color || "#aaa";

    const draw = () => {
      rafRef.current = window.requestAnimationFrame(draw);
      analyser.getByteTimeDomainData(data);

      const w = canvas.width;
      const h = canvas.height;
      ctx2d.clearRect(0, 0, w, h);

      ctx2d.lineWidth = 1;
      ctx2d.strokeStyle = stroke;
      ctx2d.beginPath();

      const mid = h / 2;
      const slice = w / bufferLength;
      let x = 0;
      for (let i = 0; i < bufferLength; i += 1) {
        const v = (data[i] - 128) / 128;
        const y = mid + v * (mid * 0.9);
        if (i === 0) ctx2d.moveTo(x, y);
        else ctx2d.lineTo(x, y);
        x += slice;
      }
      ctx2d.stroke();
    };

    draw();

    return () => {
      if (rafRef.current != null) {
        window.cancelAnimationFrame(rafRef.current);
      }
      rafRef.current = null;
      try {
        source.disconnect();
      } catch {
        // ignore disconnect errors
      }
      try {
        analyser.disconnect();
      } catch {
        // ignore disconnect errors
      }
      void audioCtx.close().catch(() => {
        // ignore close errors
      });
      audioCtxRef.current = null;
    };
  }, [active, size.h, size.w, stream]);

  if (!active) return null;

  return (
    <div ref={hostRef} className="hs-stt-oscHost">
      <canvas
        ref={canvasRef}
        className="hs-stt-oscCanvas"
        width={size.w}
        height={size.h}
        aria-hidden="true"
      />
    </div>
  );
}
