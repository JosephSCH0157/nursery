export type HammerAudioEditCutOperation = {
    id: string;
    type: "cut";
    start_sec: number;
    end_sec: number;
};
export type HammerAudioEditOperation = HammerAudioEditCutOperation;
export interface HammerPersistedAudioEdit {
    version: "v1";
    operations: HammerAudioEditOperation[];
}
export declare function cloneHammerAudioEdit(value: HammerPersistedAudioEdit | null | undefined): HammerPersistedAudioEdit | null;
export declare function normalizeHammerAudioEdit(value: unknown): HammerPersistedAudioEdit | null;
//# sourceMappingURL=audio-edit.contract.d.ts.map