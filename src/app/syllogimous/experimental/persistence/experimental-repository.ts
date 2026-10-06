import {
    DEFAULT_EXPERIMENTAL_SETTINGS,
    ExperimentalExportBundle,
    ExperimentalSessionRecord,
    ExperimentalSettingsRecord,
    ExperimentalTrialRecord,
    ExposureRecord,
    EXPERIMENTAL_EXPORT_SCHEMA_VERSION,
    EXPERIMENTAL_STORE_SCHEMA_VERSION,
    ImportMode,
    ImportPreview,
    LegacyBackupRecord,
    MasteryRecord,
} from "./experimental-records";

const DATABASE_NAME = "syllogimous-experimental";
const DATABASE_VERSION = 1;
const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
const MAX_IMPORTED_RECORDS = 50_000;

type StoreName = "meta" | "sessions" | "trials" | "mastery" | "exposures" | "settings";
type StoredRecord =
    | LegacyBackupRecord
    | ExperimentalSessionRecord
    | ExperimentalTrialRecord
    | MasteryRecord
    | ExposureRecord
    | ExperimentalSettingsRecord;

type LegacyStorage = Pick<Storage, "length" | "key" | "getItem" | "setItem">;

function browserIndexedDb(): IDBFactory | null {
    return typeof indexedDB === "undefined" ? null : indexedDB;
}

function browserLocalStorage(): LegacyStorage | null {
    try {
        return typeof localStorage === "undefined" ? null : localStorage;
    } catch {
        return null;
    }
}

function copyValue<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
}

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
    return typeof value === "string";
}

function isFiniteNumber(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value);
}

const FAMILIES = new Set(["categorical", "order", "hierarchy", "analogy", "coupledFrames", "proportional", "temporalIntervals", "contextScope", "graphStructure", "transformations"]);
const FORMATS = new Set(["threeWayInference", "constructSatisfyingModel", "constructCounterexample", "completeMapping", "identifyMissingRelation", "repairProof", "identifyNecessaryPremise", "updateAfterPremiseChange"]);
const DIMENSIONS = new Set(["supportSize", "branching", "scopeDepth", "bindingInterference", "liveFrontier", "transformComposition", "crossFrameBridges"]);
const CLASSIFICATIONS = new Set(["entailed", "refuted", "underdetermined"]);

function isFamily(value: unknown): boolean { return isString(value) && FAMILIES.has(value); }
function isClassification(value: unknown): boolean { return isString(value) && CLASSIFICATIONS.has(value); }

function isComplexityTarget(value: unknown): boolean {
    if (!isObject(value) || !isObject(value["displayedPremises"])) return false;
    return Number.isInteger(value["level"]) && Number(value["level"]) >= 1 && Number(value["level"]) <= 5
        && isString(value["primaryDimension"]) && DIMENSIONS.has(value["primaryDimension"] as string)
        && Number.isInteger(value["displayedPremises"]["min"])
        && Number.isInteger(value["displayedPremises"]["max"])
        && Number(value["displayedPremises"]["min"]) >= 0
        && Number(value["displayedPremises"]["max"]) <= 12
        && Number(value["displayedPremises"]["min"]) <= Number(value["displayedPremises"]["max"])
        && isString(value["responseFormat"]) && FORMATS.has(value["responseFormat"] as string)
        && (value["memoryVisibility"] === "visible" || value["memoryVisibility"] === "sequential" || value["memoryVisibility"] === "memoryLoaded")
        && Number.isInteger(value["distractorCount"]) && Number(value["distractorCount"]) >= 0 && Number(value["distractorCount"]) <= 8
        && (value["timePressure"] === "none" || value["timePressure"] === "measured" || value["timePressure"] === "limited");
}

function isComplexityCertificate(value: unknown): boolean {
    return isObject(value)
        && isFiniteNumber(value["displayedPremises"])
        && isFiniteNumber(value["atomicConstraints"])
        && isFiniteNumber(value["entityCount"])
        && isString(value["format"]) && FORMATS.has(value["format"] as string)
        && isString(value["strategyLanguage"])
        && (value["supportStatus"] === "exact" || value["supportStatus"] === "approximate" || value["supportStatus"] === "unavailable");
}

function isGenerationProvenance(value: unknown): boolean {
    return isObject(value)
        && isSafeId(value["semanticSeed"])
        && isSafeId(value["presentationSeed"])
        && isSafeId(value["schedulerSeed"])
        && Number.isInteger(value["attempt"])
        && Number.isInteger(value["maxAttempts"])
        && isFiniteNumber(value["elapsedMs"])
        && isFiniteNumber(value["wallTimeBudgetMs"])
        && isFiniteNumber(value["generatedAt"])
        && isComplexityTarget(value["requestedTarget"])
        && isComplexityTarget(value["appliedTarget"]);
}

function isWorld(value: unknown): boolean {
    if (!isObject(value) || !isString(value["kind"])) return false;
    const records = (field: string, check: (entry: unknown) => boolean) => Array.isArray(value[field]) && (value[field] as unknown[]).length <= 512 && (value[field] as unknown[]).every(check);
    const ids = (field: string) => records(field, isSafeId);
    const coordinate = (entry: unknown) => Array.isArray(entry) && entry.length === 2 && entry.every(isFiniteNumber);
    const pair = (entry: unknown) => Array.isArray(entry) && entry.length === 2 && entry.every(isSafeId);
    const mapping = (entry: unknown) => isObject(entry) && isSafeId(entry["source"]) && isSafeId(entry["target"]);
    const position = (entry: unknown) => isObject(entry) && isSafeId(entry["entityId"]) && Number.isInteger(entry["value"]);
    const interval = (entry: unknown) => isObject(entry) && isSafeId(entry["entityId"]) && Number.isInteger(entry["start"]) && Number.isInteger(entry["end"]) && Number(entry["start"]) < Number(entry["end"]);
    switch (value["kind"]) {
        case "categoricalWorld": return records("witnesses", entry => isObject(entry) && isSafeId(entry["id"]) && Array.isArray(entry["classes"]) && entry["classes"].length <= 20 && entry["classes"].every(isSafeId));
        case "positionWorld": return records("positions", position);
        case "intervalWorld": return records("intervals", interval);
        case "propositionWorld": return records("values", entry => isObject(entry) && isSafeId(entry["propositionId"]) && typeof entry["value"] === "boolean");
        case "mappingWorld": return records("pairs", mapping);
        case "transformWorld": return coordinate(value["initialPoint"]) && coordinate(value["finalPoint"]);
        case "scopeWorld": return isSafeId(value["contextId"]) && ids("people") && ids("objects") && records("relationPairs", pair);
        case "contextScopeWorld": return records("frames", entry => isObject(entry) && isSafeId(entry["contextId"]) && ["reads", "precedes", "sees", "signalsTo"].includes(String(entry["relation"])) && isSafeId(entry["subjectClass"]) && isSafeId(entry["objectClass"]) && Array.isArray(entry["subjectIds"]) && entry["subjectIds"].every(isSafeId) && Array.isArray(entry["objectIds"]) && entry["objectIds"].every(isSafeId) && Array.isArray(entry["relationPairs"]) && entry["relationPairs"].every(pair));
        case "membershipWorld": return records("memberships", entry => isObject(entry) && isSafeId(entry["objectId"]) && isSafeId(entry["classId"]));
        case "membershipOrderWorld": return ids("memberObjectIds") && records("positions", position) && isSafeId(value["focusObjectId"]);
        case "temporalSpatialWorld": return records("intervals", interval) && isSafeId(value["recipeOperator"]) && coordinate(value["outputPoint"]);
        case "mappingQuantityWorld": return records("mapping", mapping) && isSafeId(value["selectedTargetId"]) && records("quantities", entry => isObject(entry) && isSafeId(entry["targetId"]) && isObject(entry["value"]) && Number.isSafeInteger(entry["value"]["numerator"]) && Number.isSafeInteger(entry["value"]["denominator"]) && entry["value"]["denominator"] !== 0);
        default: return false;
    }
}

function isResponse(value: unknown): boolean {
    if (!isObject(value) || !isString(value["kind"]) || !FORMATS.has(value["kind"] as string)) return false;
    switch (value["kind"]) {
        case "threeWayInference":
        case "updateAfterPremiseChange": return isClassification(value["classification"]);
        case "constructSatisfyingModel":
        case "constructCounterexample": return isWorld(value["world"]);
        case "completeMapping": return Array.isArray(value["pairs"]) && value["pairs"].every(pair => isObject(pair) && isSafeId(pair["source"]) && isSafeId(pair["target"]));
        case "identifyMissingRelation": return isString(value["relation"]) && value["relation"].length <= 120;
        case "repairProof": return Array.isArray(value["premiseIds"]) && value["premiseIds"].every(isSafeId);
        case "identifyNecessaryPremise": return isSafeId(value["premiseId"]);
        default: return false;
    }
}

function isSafeId(value: unknown): value is string {
    return isString(value) && value.length > 0 && value.length <= 240 && !/[<>\u0000-\u001f]/u.test(value);
}

function hasBaseRecord(value: unknown): value is Record<string, unknown> & { id: string; schemaVersion: number } {
    return isObject(value)
        && isSafeId(value["id"])
        && value["schemaVersion"] === EXPERIMENTAL_STORE_SCHEMA_VERSION;
}

function isSessionRecord(value: unknown): value is ExperimentalSessionRecord {
    if (!hasBaseRecord(value)) return false;
    return (value["partition"] === "training" || value["partition"] === "assessment")
        && isString(value["protocolVersion"])
        && isFiniteNumber(value["startedAt"])
        && (value["endedAt"] === undefined || isFiniteNumber(value["endedAt"]))
        && isFiniteNumber(value["activeDurationMs"])
        && Array.isArray(value["completedItemIds"])
        && value["completedItemIds"].every(isSafeId)
        && (value["timedOutItemIds"] === undefined || (Array.isArray(value["timedOutItemIds"]) && value["timedOutItemIds"].every(isSafeId)))
        && typeof value["interruptedByReload"] === "boolean"
        && isSettingsRecord(value["settingsSnapshot"]);
}

function isSettingsRecord(value: unknown): value is ExperimentalSettingsRecord {
    if (!hasBaseRecord(value) || value["id"] !== "settings") return false;
    const minutes = value["sessionMinutes"];
    const visibility = value["memoryVisibility"];
    const pressure = value["timePressure"];
    return isString(value["semanticsVersion"])
        && (minutes === 10 || minutes === 20 || minutes === 30 || minutes === 35)
        && isFiniteNumber(value["targetAccuracyMin"])
        && isFiniteNumber(value["targetAccuracyMax"])
        && Number(value["targetAccuracyMin"]) >= 0.5
        && Number(value["targetAccuracyMax"]) <= 0.99
        && Number(value["targetAccuracyMin"]) < Number(value["targetAccuracyMax"])
        && (visibility === "visible" || visibility === "sequential" || visibility === "memoryLoaded")
        && (pressure === "none" || pressure === "measured" || pressure === "limited")
        && (value["timeLimitSeconds"] === undefined || (Number.isInteger(value["timeLimitSeconds"]) && Number(value["timeLimitSeconds"]) >= 15 && Number(value["timeLimitSeconds"]) <= 600))
        && Number.isInteger(value["distractorCount"])
        && Number(value["distractorCount"]) >= 0
        && Number(value["distractorCount"]) <= 8
        && typeof value["scaffoldsEnabled"] === "boolean"
        && isObject(value["assessmentSchedule"])
        && typeof value["assessmentSchedule"]["baselineEnabled"] === "boolean"
        && Number.isInteger(value["assessmentSchedule"]["postTrainingDelayDays"])
        && Number(value["assessmentSchedule"]["postTrainingDelayDays"]) >= 0
        && Number(value["assessmentSchedule"]["postTrainingDelayDays"]) <= 365
        && Number.isInteger(value["assessmentSchedule"]["delayedDelayDays"])
        && Number(value["assessmentSchedule"]["delayedDelayDays"]) >= 1
        && Number(value["assessmentSchedule"]["delayedDelayDays"]) <= 730
        && isFiniteNumber(value["updatedAt"]);
}

function isTrialRecord(value: unknown): value is ExperimentalTrialRecord {
    if (!hasBaseRecord(value)) return false;
    const requiredIds = ["sessionId", "itemId", "seed", "structureFamily", "structuralFingerprint"];
    const versionFields = ["generatorVersion", "semanticsVersion", "solverVersion"];
    return (value["partition"] === "training" || value["partition"] === "assessment")
        && requiredIds.every(key => isSafeId(value[key]))
        && versionFields.every(key => isString(value[key]) && String(value[key]).length <= 120)
        && isFamily(value["family"])
        && Array.isArray(value["componentFamilies"])
        && value["componentFamilies"].every(isFamily)
        && isGenerationProvenance(value["provenance"])
        && isComplexityTarget(value["targetComplexity"])
        && isComplexityCertificate(value["measuredComplexity"])
        && isResponse(value["response"])
        && isFiniteNumber(value["activeDurationMs"]) && Number(value["activeDurationMs"]) >= 0
        && (value["expectedClassification"] === undefined || isClassification(value["expectedClassification"]))
        && (value["correct"] === undefined || typeof value["correct"] === "boolean")
        && (value["confidence"] === undefined || value["confidence"] === "low" || value["confidence"] === "medium" || value["confidence"] === "high")
        && Array.isArray(value["scaffoldsUsed"])
        && value["scaffoldsUsed"].every(entry => isString(entry) && entry.length <= 80)
        && Array.isArray(value["pauses"])
        && value["pauses"].length <= 512
        && value["pauses"].every(entry => isObject(entry) && ["manual", "documentHidden", "generation", "feedback", "tutorial", "itemNotReady", "reload"].includes(String(entry["reason"])) && isFiniteNumber(entry["startedAtMonotonicMs"]) && isFiniteNumber(entry["endedAtMonotonicMs"]) && isFiniteNumber(entry["durationMs"]) && Number(entry["durationMs"]) >= 0)
        && isFiniteNumber(value["answeredAt"])
        && (value["certificateTrust"] === "locallyVerified" || value["certificateTrust"] === "externalUnverified");
}

function isMasteryRecord(value: unknown): value is MasteryRecord {
    return hasBaseRecord(value)
        && isFamily(value["family"])
        && isString(value["structureFamily"])
        && isString(value["primaryDimension"]) && DIMENSIONS.has(value["primaryDimension"] as string)
        && (value["semanticsVersion"] === undefined || isSafeId(value["semanticsVersion"]))
        && isFiniteNumber(value["alpha"])
        && Number(value["alpha"]) > 0
        && isFiniteNumber(value["beta"])
        && Number(value["beta"]) > 0
        && Number.isInteger(value["observations"])
        && typeof value["comprehensionPassed"] === "boolean"
        && isFiniteNumber(value["lastPractisedAt"])
        && isFiniteNumber(value["reviewDueAt"])
        && (value["sourceTrust"] === "local" || value["sourceTrust"] === "externalUnverified");
}

function isExposureRecord(value: unknown): value is ExposureRecord {
    return hasBaseRecord(value)
        && isSafeId(value["structuralFingerprint"])
        && (value["partition"] === "training" || value["partition"] === "assessment")
        && isFamily(value["family"])
        && isFiniteNumber(value["firstSeenAt"])
        && isFiniteNumber(value["lastSeenAt"])
        && Number.isInteger(value["count"])
        && Number(value["count"]) > 0;
}

function validateBundle(value: unknown): ExperimentalExportBundle {
    if (!isObject(value)
        || value["kind"] !== "syllogimousExperimentalExport"
        || value["schemaVersion"] !== EXPERIMENTAL_EXPORT_SCHEMA_VERSION
        || value["locale"] !== "ru"
        || value["application"] !== "Syllogimous V4"
        || value["privacy"] !== "localUserInitiatedExport"
        || !isFiniteNumber(value["exportedAt"])
        || !Array.isArray(value["sessions"])
        || !Array.isArray(value["trials"])
        || !Array.isArray(value["mastery"])
        || !Array.isArray(value["exposures"])
        || !isSettingsRecord(value["settings"])) {
        throw new Error("Файл не соответствует формату данных экспериментального режима.");
    }
    const total = value["sessions"].length + value["trials"].length + value["mastery"].length + value["exposures"].length;
    if (total > MAX_IMPORTED_RECORDS) {
        throw new Error("В файле слишком много записей.");
    }
    if (!value["sessions"].every(isSessionRecord)
        || !value["trials"].every(isTrialRecord)
        || !value["mastery"].every(isMasteryRecord)
        || !value["exposures"].every(isExposureRecord)) {
        throw new Error("Некоторые записи повреждены или имеют неподдерживаемую версию.");
    }
    for (const field of ["sessions", "trials", "mastery", "exposures"]) {
        const entries = value[field] as Array<{ id: string }>;
        if (new Set(entries.map(entry => entry.id)).size !== entries.length) throw new Error("В файле повторяются идентификаторы записей.");
    }
    return copyValue(value as unknown as ExperimentalExportBundle);
}

/**
 * Versioned, local-only repository. IndexedDB is preferred; an in-memory
 * backend keeps the experimental route usable when storage is unavailable.
 */
export class ExperimentalRepository {
    private databasePromise: Promise<IDBDatabase | null> | null = null;
    private readonly memory = new Map<StoreName, Map<string, StoredRecord>>();
    private selectedBackend: "pending" | "indexeddb" | "memory" = "pending";

    constructor(
        private readonly indexedDbFactory: IDBFactory | null = browserIndexedDb(),
        private readonly legacyStorage: LegacyStorage | null = browserLocalStorage(),
        private readonly now: () => number = () => Date.now(),
    ) {
        for (const name of ["meta", "sessions", "trials", "mastery", "exposures", "settings"] as StoreName[]) {
            this.memory.set(name, new Map<string, StoredRecord>());
        }
    }

    get backend(): "pending" | "indexeddb" | "memory" {
        return this.selectedBackend;
    }

    async initialize(): Promise<void> {
        await this.openDatabase();
        const settings = await this.getById<ExperimentalSettingsRecord>("settings", "settings");
        if (!settings) {
            await this.put("settings", { ...DEFAULT_EXPERIMENTAL_SETTINGS, updatedAt: this.now() });
        }
        await this.ensureLegacyBackup();
    }

    async getSettings(): Promise<ExperimentalSettingsRecord> {
        await this.initializeIfNeeded();
        return (await this.getById<ExperimentalSettingsRecord>("settings", "settings"))
            ?? { ...DEFAULT_EXPERIMENTAL_SETTINGS, updatedAt: this.now() };
    }

    async saveSettings(settings: ExperimentalSettingsRecord): Promise<void> {
        if (!isSettingsRecord(settings)) throw new Error("Некорректные настройки.");
        await this.put("settings", settings);
    }

    async saveSession(session: ExperimentalSessionRecord): Promise<void> {
        if (!isSessionRecord(session)) throw new Error("Некорректная запись сессии.");
        await this.put("sessions", session);
    }

    async saveTrial(trial: ExperimentalTrialRecord): Promise<void> {
        if (!isTrialRecord(trial)) throw new Error("Некорректная запись ответа.");
        await this.put("trials", trial);
    }

    async saveMastery(record: MasteryRecord): Promise<void> {
        if (!isMasteryRecord(record)) throw new Error("Некорректная оценка освоения.");
        await this.put("mastery", record);
    }

    async saveExposure(record: ExposureRecord): Promise<void> {
        if (!isExposureRecord(record)) throw new Error("Некорректная запись предъявления.");
        await this.put("exposures", record);
    }

    listSessions(): Promise<ExperimentalSessionRecord[]> { return this.getAll("sessions"); }
    listTrials(): Promise<ExperimentalTrialRecord[]> { return this.getAll("trials"); }
    listMastery(): Promise<MasteryRecord[]> { return this.getAll("mastery"); }
    listExposures(): Promise<ExposureRecord[]> { return this.getAll("exposures"); }

    async getLegacyBackup(): Promise<LegacyBackupRecord | undefined> {
        await this.initializeIfNeeded();
        return this.getById<LegacyBackupRecord>("meta", "legacy-local-storage-backup");
    }

    /** Explicit recovery action; never runs during migration or initialization. */
    async restoreLegacyBackup(): Promise<number> {
        const backup = await this.getLegacyBackup();
        if (!backup || !this.legacyStorage) return 0;
        const entries = Object.entries(backup.values);
        for (const [key, value] of entries) this.legacyStorage.setItem(key, value);
        return entries.length;
    }

    async createExportBundle(): Promise<ExperimentalExportBundle> {
        const [sessions, trials, mastery, exposures, settings] = await Promise.all([
            this.listSessions(), this.listTrials(), this.listMastery(), this.listExposures(), this.getSettings(),
        ]);
        const safeTrials = trials.map(trial => trial.partition === "assessment"
            ? { ...trial, expectedClassification: undefined, correct: undefined }
            : trial);
        return {
            kind: "syllogimousExperimentalExport",
            schemaVersion: EXPERIMENTAL_EXPORT_SCHEMA_VERSION,
            exportedAt: this.now(),
            locale: "ru",
            application: "Syllogimous V4",
            privacy: "localUserInitiatedExport",
            sessions,
            trials: safeTrials,
            mastery,
            exposures,
            settings,
        };
    }

    previewImport(text: string): ImportPreview {
        const byteLength = new TextEncoder().encode(text).byteLength;
        if (byteLength > MAX_IMPORT_BYTES) {
            throw new Error("Файл превышает допустимый размер 2 МБ.");
        }
        let parsed: unknown;
        try {
            parsed = JSON.parse(text) as unknown;
        } catch {
            throw new Error("Не удалось прочитать JSON-файл.");
        }
        const bundle = validateBundle(parsed);
        const assessmentAnswersRemoved = bundle.trials.filter(trial =>
            trial.partition === "assessment" && trial.expectedClassification === undefined).length;
        return {
            bundle,
            byteLength,
            sessionCount: bundle.sessions.length,
            trialCount: bundle.trials.length,
            masteryCount: bundle.mastery.length,
            exposureCount: bundle.exposures.length,
            assessmentAnswersRemoved,
            summaryRu: `Сессий: ${bundle.sessions.length}; ответов: ${bundle.trials.length}; записей освоения: ${bundle.mastery.length}; предъявлений: ${bundle.exposures.length}.`,
        };
    }

    async importPreview(preview: ImportPreview, mode: ImportMode): Promise<void> {
        const bundle = validateBundle(preview.bundle);
        if (mode === "replace") await this.clearUserStores();
        for (const session of bundle.sessions) await this.put("sessions", session);
        for (const trial of bundle.trials) {
            await this.put("trials", { ...trial, certificateTrust: "externalUnverified" });
        }
        for (const record of bundle.mastery) await this.put("mastery", { ...record, sourceTrust: "externalUnverified" });
        for (const exposure of bundle.exposures) await this.put("exposures", exposure);
        await this.put("settings", { ...bundle.settings, updatedAt: this.now() });
    }

    /** Deletes only experimental records; legacy localStorage and its backup remain untouched. */
    async deleteExperimentalData(): Promise<void> {
        await this.clearUserStores();
        await this.put("settings", { ...DEFAULT_EXPERIMENTAL_SETTINGS, updatedAt: this.now() });
    }

    private async initializeIfNeeded(): Promise<void> {
        if (this.selectedBackend === "pending") await this.initialize();
    }

    private async ensureLegacyBackup(): Promise<void> {
        const existing = await this.getById<LegacyBackupRecord>("meta", "legacy-local-storage-backup");
        if (existing || !this.legacyStorage) return;
        const values: Record<string, string> = {};
        for (let index = 0; index < this.legacyStorage.length; index++) {
            const key = this.legacyStorage.key(index);
            if (!key || (!key.startsWith("SYL_") && key !== "darkmode")) continue;
            const value = this.legacyStorage.getItem(key);
            if (value !== null) values[key] = value;
        }
        await this.put("meta", {
            id: "legacy-local-storage-backup",
            schemaVersion: EXPERIMENTAL_STORE_SCHEMA_VERSION,
            createdAt: this.now(),
            source: "legacyLocalStorage",
            values,
        });
    }

    private async clearUserStores(): Promise<void> {
        for (const store of ["sessions", "trials", "mastery", "exposures", "settings"] as StoreName[]) {
            await this.clear(store);
        }
    }

    private openDatabase(): Promise<IDBDatabase | null> {
        if (this.databasePromise) return this.databasePromise;
        if (!this.indexedDbFactory) {
            this.selectedBackend = "memory";
            this.databasePromise = Promise.resolve(null);
            return this.databasePromise;
        }
        this.databasePromise = new Promise(resolve => {
            let request: IDBOpenDBRequest;
            try {
                request = this.indexedDbFactory!.open(DATABASE_NAME, DATABASE_VERSION);
            } catch {
                this.selectedBackend = "memory";
                resolve(null);
                return;
            }
            request.onupgradeneeded = () => {
                const database = request.result;
                for (const store of ["meta", "sessions", "trials", "mastery", "exposures", "settings"] as StoreName[]) {
                    if (!database.objectStoreNames.contains(store)) database.createObjectStore(store, { keyPath: "id" });
                }
            };
            request.onsuccess = () => {
                this.selectedBackend = "indexeddb";
                resolve(request.result);
            };
            request.onerror = () => {
                this.selectedBackend = "memory";
                resolve(null);
            };
            request.onblocked = () => {
                this.selectedBackend = "memory";
                resolve(null);
            };
        });
        return this.databasePromise;
    }

    private async put(store: StoreName, value: StoredRecord): Promise<void> {
        const database = await this.openDatabase();
        if (!database) {
            this.memory.get(store)!.set(value.id, copyValue(value));
            return;
        }
        await new Promise<void>((resolve, reject) => {
            const transaction = database.transaction(store, "readwrite");
            transaction.objectStore(store).put(copyValue(value));
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error ?? new Error("Не удалось сохранить данные."));
            transaction.onabort = () => reject(transaction.error ?? new Error("Сохранение отменено."));
        });
    }

    private async getById<T extends StoredRecord>(store: StoreName, id: string): Promise<T | undefined> {
        const database = await this.openDatabase();
        if (!database) {
            const value = this.memory.get(store)!.get(id);
            return value ? copyValue(value as T) : undefined;
        }
        return new Promise<T | undefined>((resolve, reject) => {
            const request = database.transaction(store, "readonly").objectStore(store).get(id);
            request.onsuccess = () => resolve(request.result === undefined ? undefined : copyValue(request.result as T));
            request.onerror = () => reject(request.error ?? new Error("Не удалось прочитать данные."));
        });
    }

    private async getAll<T extends StoredRecord>(store: StoreName): Promise<T[]> {
        const database = await this.openDatabase();
        if (!database) return [...this.memory.get(store)!.values()].map(value => copyValue(value as T));
        return new Promise<T[]>((resolve, reject) => {
            const request = database.transaction(store, "readonly").objectStore(store).getAll();
            request.onsuccess = () => resolve(copyValue(request.result as T[]));
            request.onerror = () => reject(request.error ?? new Error("Не удалось прочитать данные."));
        });
    }

    private async clear(store: StoreName): Promise<void> {
        const database = await this.openDatabase();
        if (!database) {
            this.memory.get(store)!.clear();
            return;
        }
        await new Promise<void>((resolve, reject) => {
            const transaction = database.transaction(store, "readwrite");
            transaction.objectStore(store).clear();
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error ?? new Error("Не удалось удалить данные."));
            transaction.onabort = () => reject(transaction.error ?? new Error("Удаление отменено."));
        });
    }
}

export function createExperimentalRepository(): ExperimentalRepository {
    return new ExperimentalRepository();
}
