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
 * Returns true if `value` is a syntactically valid email address.
 * Simple RFC-5322-ish check: local-part@domain.tld, no spaces.
 */
export function isValidEmail(value: unknown): boolean {
    if (typeof value !== 'string') return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

/**
 * Returns true if `value` is a valid password: at least 6 characters and
 * containing at least one digit.
 */
export function isValidPassword(value: unknown): boolean {
    if (typeof value !== 'string') return false;
    return value.length >= 6 && /\d/.test(value);
}

/**
 * Returns true if `value` is a valid date (i.e. not `NaN` when parsed).
 * Used to catch malformed date inputs (e.g. text typed into a date field)
 * before relying on Date-based checks.
 */
export function isValidDate(value: unknown): boolean {
    if (!value) return false;
    const d = new Date(value as string | number | Date);
    return !isNaN(d.getTime());
}

/**
 * Returns true if `value` is a finite number (or numeric string).
 * Used to catch malformed numeric inputs (e.g. letters typed into a
 * duration/number field).
 */
export function isValidNumber(value: unknown): boolean {
    if (value === null || value === undefined || value === '') return false;
    const n = Number(value);
    return !isNaN(n) && isFinite(n);
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
 * Returns true if `value` is a valid date that represents an age of at most
 * 120 years (i.e. the birth date is not more than 120 years ago).
 * Used to validate birth dates (data_nascimento).
 */
export function isWithinMaxAge(value: unknown, maxAgeYears = 120): boolean {
    if (!value) return false;
    const d = new Date(value as string | number | Date);
    if (isNaN(d.getTime())) return false;
    const minDate = new Date();
    minDate.setFullYear(minDate.getFullYear() - maxAgeYears);
    minDate.setHours(0, 0, 0, 0);
    return d.getTime() >= minDate.getTime();
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

/**
 * Returns true if `value` is a valid date that falls on a weekday
 * (Monday through Friday). Used to validate consulta dates — the
 * clinic is closed on weekends.
 */
export function isWeekday(value: unknown): boolean {
    if (!value) return false;
    const d = new Date(value as string | number | Date);
    if (isNaN(d.getTime())) return false;
    const day = d.getDay();
    return day !== 0 && day !== 6;
}

/**
 * Returns true if the consulta starting at `value` and lasting `duracao`
 * minutes falls entirely within the clinic's opening hours (09:00–19:00).
 * Both the start time and the end time must be within [09:00, 19:00].
 */
export function isWithinClinicHours(value: unknown, duracao: unknown): boolean {
    if (!value) return false;
    const start = new Date(value as string | number | Date);
    if (isNaN(start.getTime())) return false;

    const dur = Number(duracao);
    if (isNaN(dur) || dur <= 0) return false;

    const end = new Date(start.getTime() + dur * 60_000);

    const OPEN_HOUR = 9;
    const CLOSE_HOUR = 19;

    const startMinutes = start.getHours() * 60 + start.getMinutes();
    const endMinutes = end.getHours() * 60 + end.getMinutes();

    const openMinutes = OPEN_HOUR * 60;
    const closeMinutes = CLOSE_HOUR * 60;

    // End must not roll over to the next day either.
    const sameDay = start.getFullYear() === end.getFullYear()
        && start.getMonth() === end.getMonth()
        && start.getDate() === end.getDate();

    return sameDay
        && startMinutes >= openMinutes
        && endMinutes <= closeMinutes;
}
