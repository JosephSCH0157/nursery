import { buildRecordingFilename, pickRecordingBaseTitle } from "../../src/recording/recording-name";

describe("recording-name", () => {
  function expectedLocalTimestamp(date: Date): string {
    const pad2 = (n: number) => String(n).padStart(2, "0");
    return [
      `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`,
      `${pad2(date.getHours())}-${pad2(date.getMinutes())}-${pad2(date.getSeconds())}`,
    ].join("_");
  }

  test("prefers live input title over route/stored", () => {
    expect(pickRecordingBaseTitle({
      inputTitle: "Live Script Title",
      routeEpisodeTitle: "Route Episode Title",
      storedTitle: "Stored Title",
    })).toBe("Live Script Title");
  });

  test("falls back to route title when input missing", () => {
    expect(pickRecordingBaseTitle({
      inputTitle: "   ",
      routeEpisodeTitle: "Route Episode Title",
      storedTitle: "Stored Title",
    })).toBe("Route Episode Title");
  });

  test("falls back to stored title when input/route missing", () => {
    expect(pickRecordingBaseTitle({
      inputTitle: null,
      routeEpisodeTitle: null,
      storedTitle: "Stored Title",
    })).toBe("Stored Title");
  });

  test("builds deterministic filename shape", () => {
    const date = new Date("2026-04-08T00:00:00.000Z");
    const ts = expectedLocalTimestamp(date);
    expect(buildRecordingFilename({
      mode: "av",
      baseTitle: "My Episode",
      date,
    })).toBe(`My_Episode_${ts}.webm`);

    expect(buildRecordingFilename({
      mode: "audio",
      baseTitle: "My Episode",
      date,
    })).toBe(`My_Episode_${ts}_audio.wav`);
  });
});
