function readString(value) {
    if (typeof value !== "string")
        return null;
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
}
function readNumber(value) {
    if (typeof value === "number" && Number.isFinite(value))
        return value;
    if (typeof value === "string") {
        const parsed = Number(value);
        if (Number.isFinite(parsed))
            return parsed;
    }
    return null;
}
function readObject(value) {
    if (!value || typeof value !== "object" || Array.isArray(value))
        return null;
    return value;
}
function sortHammerAudioEditOperations(operations) {
    return [...operations].sort((left, right) => (left.start_sec - right.start_sec
        || left.end_sec - right.end_sec
        || left.id.localeCompare(right.id)));
}
function canonicalizeHammerAudioEdit(value) {
    if (value == null)
        return null;
    const row = readObject(value);
    if (!row || readString(row.version) !== "v1" || !Array.isArray(row.operations)) {
        return null;
    }
    const operations = [];
    for (const entry of row.operations) {
        const operation = readObject(entry);
        const id = readString(operation?.id);
        const type = readString(operation?.type);
        const startSec = readNumber(operation?.start_sec);
        const endSec = readNumber(operation?.end_sec);
        if (!id || type !== "cut" || startSec == null || endSec == null) {
            return null;
        }
        if (startSec < 0 || endSec <= startSec) {
            return null;
        }
        operations.push({
            id,
            type: "cut",
            start_sec: startSec,
            end_sec: endSec,
        });
    }
    return {
        version: "v1",
        operations: sortHammerAudioEditOperations(operations),
    };
}
export function cloneHammerAudioEdit(value) {
    return canonicalizeHammerAudioEdit(value);
}
export function normalizeHammerAudioEdit(value) {
    return canonicalizeHammerAudioEdit(value);
}
