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
