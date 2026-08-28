#!/usr/bin/env python3
"""Deterministic CPU final-render compositor for Hammer background effects."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path

import cv2
import mediapipe as mp
import numpy as np


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def clamp(value: float, low: float, high: float) -> float:
    return min(high, max(low, value))


def refine(mask: np.ndarray, settings: dict, previous: np.ndarray | None) -> np.ndarray:
    expansion = int(clamp(float(settings.get("subject_expansion_px", 0)), 0, 64))
    feather = int(clamp(float(settings.get("edge_feather_px", 0)), 0, 64))
    smoothing = clamp(float(settings.get("temporal_smoothing", 0)), 0, 1)
    result = np.clip(mask.astype(np.float32), 0, 1)
    if expansion:
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (expansion * 2 + 1, expansion * 2 + 1))
        result = cv2.dilate(result, kernel)
    if feather:
        size = feather * 2 + 1
        result = cv2.GaussianBlur(result, (size, size), max(0.1, feather / 3))
    if previous is not None and previous.shape == result.shape and smoothing:
        result = previous * smoothing + result * (1 - smoothing)
    return np.clip(result, 0, 1)


def background(frame: np.ndarray, effect: str, settings: dict, replacement: np.ndarray | None) -> np.ndarray:
    if effect == "blur":
        radius = max(1, int(settings.get("blur_px", 8)))
        size = radius * 2 + 1
        return cv2.GaussianBlur(frame, (size, size), max(0.1, radius / 3))
    if effect == "wash":
        dim = clamp(float(settings.get("dim_amount", 0.25)), 0, 1)
        desat = clamp(float(settings.get("desaturate_amount", 0.15)), 0, 1)
        gray = cv2.cvtColor(cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY), cv2.COLOR_GRAY2BGR)
        return np.clip((frame * (1 - desat) + gray * desat) * (1 - dim), 0, 255).astype(np.uint8)
    if effect == "replacement_solid":
        color = str(settings.get("replacement_color", "#000000")).lstrip("#")
        if len(color) != 6:
            raise ValueError("background_effect_replacement_color_invalid")
        rgb = tuple(int(color[index:index + 2], 16) for index in (0, 2, 4))
        output = np.empty_like(frame)
        output[:] = rgb[::-1]
        return output
    if effect == "replacement_image" and replacement is not None:
        return cv2.resize(replacement, (frame.shape[1], frame.shape[0]), interpolation=cv2.INTER_AREA)
    raise ValueError("background_effect_kind_unsupported")


def render(args: argparse.Namespace) -> dict:
    plan = json.loads(Path(args.plan).read_text(encoding="utf-8"))
    authority = plan["export_authority"]
    model = Path(authority.get("model_path") or os.environ["FORGE_SEGMENTATION_MODEL_PATH"])
    expected_sha = authority["model_sha256"].lower()
    actual_sha = sha256(model)
    if actual_sha != expected_sha or actual_sha != os.environ.get("FORGE_SEGMENTATION_MODEL_SHA256", actual_sha).lower():
        raise ValueError("background_effect_model_sha_mismatch")
    if authority.get("failure_policy") != "fail_closed":
        raise ValueError("background_effect_failure_policy_invalid")

    effect = plan["effect_kind"]
    settings = plan["settings_v1"]
    replacement = cv2.imread(args.replacement, cv2.IMREAD_COLOR) if args.replacement else None
    if effect == "replacement_image" and replacement is None:
        raise ValueError("background_effect_replacement_unresolved")

    cap = cv2.VideoCapture(args.input)
    if not cap.isOpened():
        raise ValueError("background_effect_source_unreadable")
    source_fps = cap.get(cv2.CAP_PROP_FPS)
    fps = float(authority["frame_policy"]["fps"])
    if fps <= 0 or source_fps <= 0 or abs(source_fps - fps) > 0.01:
        raise ValueError("background_effect_frame_policy_mismatch")
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    temp_video = str(Path(args.output).with_suffix(".video-only.mp4"))
    writer = cv2.VideoWriter(temp_video, cv2.VideoWriter_fourcc(*"mp4v"), fps, (width, height))
    if not writer.isOpened():
        raise ValueError("background_effect_encoder_unavailable")

    options = mp.tasks.vision.ImageSegmenterOptions(
        base_options=mp.tasks.BaseOptions(model_asset_path=str(model)),
        running_mode=mp.tasks.vision.RunningMode.VIDEO,
        output_category_mask=True,
        output_confidence_masks=True,
    )
    frame_count = 0
    previous = None
    confidence_min = 1.0
    threshold = float(authority.get("confidence_threshold", 0.35))
    reset_frames = {int(value) for value in plan.get("temporal_reset_frame_indices", [])}
    with mp.tasks.vision.ImageSegmenter.create_from_options(options) as segmenter:
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            timestamp_ms = int(round(frame_count * 1000 / fps))
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            result = segmenter.segment_for_video(mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb), timestamp_ms)
            if not result.confidence_masks:
                raise ValueError("background_effect_mask_missing")
            confidence_masks = [item.numpy_view().copy() for item in result.confidence_masks]
            mask = confidence_masks[-1]
            score = float(np.mean(np.max(np.stack(confidence_masks), axis=0))) if len(confidence_masks) > 1 else float(np.mean(np.maximum(mask, 1 - mask)))
            confidence_min = min(confidence_min, score)
            if score < threshold:
                raise ValueError("background_effect_mask_confidence_low")
            if frame_count in reset_frames:
                previous = None
            matte = refine(mask, settings, previous)
            previous = matte
            bg = background(frame, effect, settings, replacement)
            alpha = matte[:, :, None]
            writer.write(np.clip(frame * alpha + bg * (1 - alpha), 0, 255).astype(np.uint8))
            frame_count += 1
    cap.release()
    writer.release()
    if frame_count == 0:
        raise ValueError("background_effect_frames_missing")
    command = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", temp_video]
    if args.audio:
        command += ["-i", args.audio, "-map", "0:v:0", "-map", "1:a:0", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", args.output]
    else:
        command += ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-an", args.output]
    subprocess.run(command, check=True)
    Path(temp_video).unlink(missing_ok=True)
    return {"frame_count": frame_count, "fps": fps, "width": width, "height": height, "minimum_confidence": confidence_min, "model_sha256": actual_sha}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--plan", required=True)
    parser.add_argument("--replacement")
    parser.add_argument("--audio")
    args = parser.parse_args()
    try:
        print(json.dumps({"ok": True, "evidence": render(args)}, sort_keys=True))
        return 0
    except Exception as error:
        print(json.dumps({"ok": False, "error": str(error)}, sort_keys=True), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
