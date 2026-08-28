FROM python:3.11.9-slim-bookworm

WORKDIR /app

ARG SELFIE_SEGMENTER_URL=https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter_landscape/float16/latest/selfie_segmenter_landscape.tflite
ARG SELFIE_SEGMENTER_SHA256=490e9ea734313e0de10fa0cd9e3c6133e36ea4db2b7a49bde9ef019f72796b8e

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg nodejs npm ca-certificates curl \
  && rm -rf /var/lib/apt/lists/* \
  && pip install --no-cache-dir mediapipe==0.10.21 numpy==1.26.4 opencv-python-headless==4.10.0.84

RUN mkdir -p /app/models \
  && curl --fail --location --silent --show-error "$SELFIE_SEGMENTER_URL" -o /app/models/selfie_segmenter_landscape.tflite \
  && echo "$SELFIE_SEGMENTER_SHA256  /app/models/selfie_segmenter_landscape.tflite" | sha256sum -c -

COPY package.json ./
COPY server.mjs ./
COPY media-probe.mjs ./
COPY background-effects-render.py ./

ENV FORGE_SEGMENTATION_MODEL_PATH=/app/models/selfie_segmenter_landscape.tflite \
    FORGE_SEGMENTATION_MODEL_SHA256=490e9ea734313e0de10fa0cd9e3c6133e36ea4db2b7a49bde9ef019f72796b8e \
    FORGE_SEGMENTATION_PROVIDER_VERSION=mediapipe-tasks-python-0.10.21 \
    FORGE_SEGMENTATION_REFINEMENT_VERSION=forge-matte-v1

EXPOSE 8080

ENTRYPOINT ["node", "server.mjs"]
