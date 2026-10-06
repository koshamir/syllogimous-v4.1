import { SemanticCertificate } from "../models/semantic.models";

interface CacheEntry {
    semanticsVersion: string;
    solverVersion: string;
    canonicalInput: string;
    certificate: SemanticCertificate;
}

/** In-memory session cache. Persisted certificates are always revalidated separately. */
export class SemanticCertificateCache {
    private readonly entries = new Map<string, CacheEntry>();

    get(key: string, semanticsVersion: string, solverVersion: string, canonicalInput: string,
        validate: (certificate: SemanticCertificate) => boolean = () => false): SemanticCertificate | undefined {
        const entry = this.entries.get(key);
        if (!entry
            || entry.semanticsVersion !== semanticsVersion
            || entry.solverVersion !== solverVersion
            || entry.canonicalInput !== canonicalInput
            || !entry.certificate.verification.premisesChecked
            || !validate(structuredClone(entry.certificate))) {
            this.entries.delete(key);
            return undefined;
        }
        return structuredClone(entry.certificate);
    }

    set(key: string, entry: CacheEntry): void {
        if (this.entries.size >= 128 && !this.entries.has(key)) this.entries.delete(this.entries.keys().next().value as string);
        this.entries.set(key, structuredClone(entry));
    }

    invalidate(): void {
        this.entries.clear();
    }
}
