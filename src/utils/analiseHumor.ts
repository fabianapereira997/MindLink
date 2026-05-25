const Questionario = require('../models/questionario');
const Alerta       = require('../models/alerta');

const SYMPTOM_KEYWORDS = ['ansiedade', 'stress', 'insónia', 'insonia', 'pânico', 'panico'];
const DEDUP_WINDOW_MS  = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Returns true if an unread alerta of the same tipo already exists for this
 * paciente within the last 7 days (avoids duplicate alerts on repeated runs).
 */
async function alertaAlreadyExists(pacienteId: string, tipo: string): Promise<boolean> {
    const cutoff = new Date(Date.now() - DEDUP_WINDOW_MS);
    const existing = await Alerta.findOne({
        paciente: pacienteId,
        tipo,
        lido: false,
        createdAt: { $gte: cutoff },
    });
    return !!existing;
}

export interface AnaliseResult {
    questionariosAnalisados: number;
    alertasGerados: unknown[];
    alertasExistentesIgnorados: string[];
}

/**
 * Runs the rule-based mood analysis for a paciente.
 * Reads the last 7 Questionarios and generates Alerta documents when risk
 * patterns are detected. Duplicate unread alerts within 7 days are skipped.
 *
 * Rules:
 *  1. humor === 1 in any recent record → "urgente" / "alto"
 *  2. last 3 records all have humor <= 2 → "humor_baixo" / "medio"
 *  3. symptom keywords appear in ≥ 2 records → "sintomas" / "baixo"
 */
export async function runAnalise(pacienteId: string | string[], psicologoId: string): Promise<AnaliseResult> {
    if (Array.isArray(pacienteId)) {
        return { questionariosAnalisados: 0, alertasGerados: [], alertasExistentesIgnorados: [] };
    }
    const questionarios: any[] = await Questionario.find({ paciente: pacienteId })
        .sort({ data: -1 })
        .limit(7);

    if (questionarios.length === 0) {
        return { questionariosAnalisados: 0, alertasGerados: [], alertasExistentesIgnorados: [] };
    }

    const alertasGerados: unknown[]  = [];
    const alertasExistentesIgnorados: string[] = [];

    // ── Rule 1: any humor === 1 ──────────────────────────────────────────────
    const hasUrgent = questionarios.some((q) => q.humor === 1);
    if (hasUrgent) {
        const tipo = 'urgente';
        if (await alertaAlreadyExists(pacienteId, tipo)) {
            alertasExistentesIgnorados.push(tipo);
        } else {
            const alerta = await Alerta.create({
                paciente: pacienteId,
                psicologo: psicologoId,
                tipo,
                nivel: 'alto',
                mensagem: 'Humor crítico registado. Contacto urgente recomendado.',
                origem: 'analise',
            });
            alertasGerados.push(alerta);
        }
    }

    // ── Rule 2: last 3 records all have humor <= 2 ───────────────────────────
    if (questionarios.length >= 3) {
        const last3 = questionarios.slice(0, 3);
        const allLow = last3.every((q) => q.humor <= 2);
        if (allLow) {
            const tipo = 'humor_baixo';
            if (await alertaAlreadyExists(pacienteId, tipo)) {
                alertasExistentesIgnorados.push(tipo);
            } else {
                const alerta = await Alerta.create({
                    paciente: pacienteId,
                    psicologo: psicologoId,
                    tipo,
                    nivel: 'medio',
                    mensagem: '3 registos consecutivos com humor baixo. Consulta recomendada.',
                    origem: 'analise',
                });
                alertasGerados.push(alerta);
            }
        }
    }

    // ── Rule 3: symptom keywords appear in ≥ 2 records ──────────────────────
    const recordsWithKeyword = questionarios.filter((q) => {
        const sintomas = (q.sintomas ?? '').toLowerCase();
        return SYMPTOM_KEYWORDS.some((kw) => sintomas.includes(kw));
    });

    if (recordsWithKeyword.length >= 2) {
        const tipo = 'sintomas';
        if (await alertaAlreadyExists(pacienteId, tipo)) {
            alertasExistentesIgnorados.push(tipo);
        } else {
            const alerta = await Alerta.create({
                paciente: pacienteId,
                psicologo: psicologoId,
                tipo,
                nivel: 'baixo',
                mensagem: 'Sintomas recorrentes detectados.',
                origem: 'analise',
            });
            alertasGerados.push(alerta);
        }
    }

    return {
        questionariosAnalisados: questionarios.length,
        alertasGerados,
        alertasExistentesIgnorados,
    };
}
