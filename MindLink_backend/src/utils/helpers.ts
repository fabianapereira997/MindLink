import { Types } from 'mongoose';
const Psicologo = require('../models/psicologo');
const Paciente  = require('../models/paciente');

/**
 * Returns the Psicologo document for the given User._id, or null if not found.
 */
export async function getPsicologoByUserId(userId: string): Promise<any> {
    return Psicologo.findOne({ user: userId });
}

/**
 * Returns the Paciente document for the given User._id, or null if not found.
 */
export async function getPacienteByUserId(userId: string): Promise<any> {
    return Paciente.findOne({ user: userId });
}

/**
 * Returns true if the psicologo (identified by User._id) is the assigned psicologo
 * for the given Paciente profile (identified by Paciente._id).
 * Express 5 types req.params values as string | string[], so we accept both.
 */
export async function isPsicologoAssignedToPaciente(
    psicologoUserId: string,
    pacienteProfileId: string | string[]
): Promise<boolean> {
    if (Array.isArray(pacienteProfileId)) return false;
    const psicologoProfile = await getPsicologoByUserId(psicologoUserId);
    if (!psicologoProfile) return false;
    const paciente = await Paciente.findById(pacienteProfileId);
    if (!paciente) return false;
    return paciente.psicologo.toString() === psicologoProfile._id.toString();
}

/**
 * Returns true if the paciente (identified by User._id) owns the given
 * Paciente profile (identified by Paciente._id).
 */
export async function isPacienteOwner(
    pacienteUserId: string,
    pacienteProfileId: string | string[]
): Promise<boolean> {
    if (Array.isArray(pacienteProfileId)) return false;
    const pacienteProfile = await getPacienteByUserId(pacienteUserId);
    if (!pacienteProfile) return false;
    return pacienteProfile._id.toString() === pacienteProfileId;
}

/**
 * Returns true if the string is a valid MongoDB ObjectId.
 * Accepts string | string[] because Express 5 types path params as string | string[].
 */
export function isValidObjectId(id: string | string[]): boolean {
    if (Array.isArray(id)) return false;
    return Types.ObjectId.isValid(id);
}

/**
 * Returns true if `value` is a valid date whose calendar day is today or earlier.
 * Used to validate birth dates (data_nascimento) — they cannot be in the future.
 */
export function isTodayOrPast(value: unknown): boolean {
    if (!value) return false;
    const d = new Date(value as string | number | Date);
    if (isNaN(d.getTime())) return false;
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);
    return d.getTime() <= endOfToday.getTime();
}

/**
 * Returns true if `value` is a valid date whose calendar day is today or later.
 * Used to validate consulta dates — they cannot be scheduled in the past.
 */
export function isTodayOrFuture(value: unknown): boolean {
    if (!value) return false;
    const d = new Date(value as string | number | Date);
    if (isNaN(d.getTime())) return false;
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    return day.getTime() >= startOfToday.getTime();
}

/**
 * Returns true if `value` is a valid date/time that is now or in the future.
 * Used to validate consulta dates — they cannot be scheduled for a time of
 * day that has already passed (not just an earlier calendar day).
 */
export function isNowOrFuture(value: unknown): boolean {
    if (!value) return false;
    const d = new Date(value as string | number | Date);
    if (isNaN(d.getTime())) return false;
    return d.getTime() >= Date.now();
}
