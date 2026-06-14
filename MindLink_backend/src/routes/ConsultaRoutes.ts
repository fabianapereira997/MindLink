import { Request, Response } from 'express';
import {
    getPsicologoByUserId,
    getPacienteByUserId,
    isPsicologoAssignedToPaciente,
    isValidObjectId,
    isTodayOrFuture,
    isNowOrFuture,
    isWithinClinicHours,
    isWeekday,
} from '../utils/helpers';

const express  = require('express');
const router   = express.Router();
const Consulta = require('../models/consulta');
const Mensagem = require('../models/mensagem');
const { verifyToken }       = require('../middleware/VerifyToken');
const { verifyTokenByRole } = require('../middleware/VerifyTokenByRole');

// ─── POST /api/consultas ───────────────────────────────────────────────────────
// Psicologo only. psicologo is auto-filled from the logged-in profile.
router.post('/', verifyToken, verifyTokenByRole('psicologo'), async (req: Request, res: Response) => {
    try {
        const psicologoProfile = await getPsicologoByUserId(req.user!.id);
        if (!psicologoProfile) {
            return res.status(404).json({ error: 'Perfil de psicólogo não encontrado' });
        }
        const { paciente, data, duracao, estado, notas } = req.body;

        if (!isValidObjectId(paciente)) {
            return res.status(400).json({ error: 'ID de paciente inválido' });
        }

        if (!isTodayOrFuture(data)) {
            return res.status(400).json({ error: 'Não é possível agendar uma consulta numa data que já passou' });
        }

        if (!isNowOrFuture(data)) {
            return res.status(400).json({ error: 'Não é possível agendar uma consulta para uma hora que já passou' });
        }

        if (!isWithinClinicHours(data, duracao)) {
            return res.status(400).json({ error: 'A consulta deve ser agendada entre as 9:00 e as 19:00' });
        }

        if (!isWeekday(data)) {
            return res.status(400).json({ error: 'Não é possível agendar consultas ao fim de semana' });
        }

        const assigned = await isPsicologoAssignedToPaciente(req.user!.id, paciente);
        if (!assigned) {
            return res.status(403).json({ error: 'Acesso negado: paciente não associado a este psicólogo' });
        }

        // ── Overlap check ──────────────────────────────────────────────────────
        // A psychologist cannot have two non-cancelled consultations whose
        // time windows [data, data + duracao min) overlap.
        const newStart = new Date(data);
        const newEnd   = new Date(newStart.getTime() + Number(duracao) * 60_000);

        // Fetch candidates: non-cancelled consultas for this psicologo in a
        // generous window (±1 day) to avoid scanning the whole collection.
        const candidates = await Consulta.find({
            psicologo: psicologoProfile._id,
            estado:    { $ne: 'cancelada' },
            data:      {
                $gte: new Date(newStart.getTime() - 24 * 60 * 60_000),
                $lte: new Date(newStart.getTime() + 24 * 60 * 60_000),
            },
        });

        const hasOverlap = candidates.some((c: any) => {
            const cStart = new Date(c.data);
            const cEnd   = new Date(cStart.getTime() + Number(c.duracao) * 60_000);
            return newStart < cEnd && newEnd > cStart;
        });

        if (hasOverlap) {
            return res.status(409).json({
                error: 'Já existe uma consulta agendada neste horário. Escolha um horário diferente.',
            });
        }
        // ── End overlap check ──────────────────────────────────────────────────

        const consulta = new Consulta({ paciente, psicologo: psicologoProfile._id, data, duracao, estado: 'pendente', notas });
        await consulta.save();
        await consulta.populate([
            { path: 'paciente', populate: { path: 'user', select: 'nome email' } },
            { path: 'psicologo', populate: { path: 'user', select: 'nome email' } },
        ]);

        // ── Chat notification ───────────────────────────────────────────────────
        // Post a popup-style message in the chat so the patient can confirm or
        // reject the newly scheduled appointment.
        const dataConsulta = new Date(consulta.data);
        const pad = (n: number) => String(n).padStart(2, '0');
        const anoCurto = String(dataConsulta.getFullYear()).slice(-2);
        const dataFormatada = `${pad(dataConsulta.getDate())}/${pad(dataConsulta.getMonth() + 1)}/${anoCurto}, ${pad(dataConsulta.getHours())}:${pad(dataConsulta.getMinutes())}`;
        await Mensagem.create({
            paciente,
            psicologo: psicologoProfile._id,
            remetente: 'psicologo',
            tipo: 'consulta_pedido',
            consulta: consulta._id,
            consultaData: consulta.data,
            consultaDuracao: consulta.duracao,
            mensagem: `Foi agendada uma consulta para ${dataFormatada}. Pode confirmar a sua presença?`,
            resposta: 'pendente',
        });

        res.status(201).json(consulta);
    } catch (error) {
        res.status(400).json({ error: (error as Error).message });
    }
});

// ─── GET /api/consultas ────────────────────────────────────────────────────────
// Psicologo: only their own. Admin: all.
router.get('/', verifyToken, verifyTokenByRole('psicologo', 'admin'), async (req: Request, res: Response) => {
    try {
        let filter: Record<string, unknown> = {};

        if (req.user!.tipo === 'psicologo') {
            const psicologoProfile = await getPsicologoByUserId(req.user!.id);
            if (!psicologoProfile) {
                return res.status(404).json({ error: 'Perfil de psicólogo não encontrado' });
            }
            filter = { psicologo: psicologoProfile._id };
        }

        const consultas = await Consulta.find(filter)
            .populate({ path: 'paciente', populate: { path: 'user', select: 'nome email' } })
            .populate({ path: 'psicologo', populate: { path: 'user', select: 'nome email' } });
        res.json(consultas);
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

// ─── GET /api/consultas/psicologo — alias for logged-in psicologo ─────────────
// Returns all consultas for the authenticated psicologo. Must come before /:id.
router.get('/psicologo', verifyToken, verifyTokenByRole('psicologo'), async (req: Request, res: Response) => {
    try {
        const psicologoProfile = await getPsicologoByUserId(req.user!.id);
        if (!psicologoProfile) {
            return res.status(404).json({ error: 'Perfil de psicólogo não encontrado' });
        }
        const consultas = await Consulta.find({ psicologo: psicologoProfile._id })
            .populate({ path: 'paciente', populate: { path: 'user', select: 'nome email' } })
            .populate({ path: 'psicologo', populate: { path: 'user', select: 'nome email' } });
        res.json(consultas);
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

// ─── GET /api/consultas/psicologo/:psicologoId ────────────────────────────────
// Psicologo: only if :psicologoId is their own profile. Admin: any.
// Must come before /:id.
router.get('/psicologo/:psicologoId', verifyToken, verifyTokenByRole('psicologo', 'admin'), async (req: Request, res: Response) => {
    try {
        const { psicologoId } = req.params;
        if (!isValidObjectId(psicologoId)) {
            return res.status(400).json({ error: 'ID de psicólogo inválido' });
        }

        if (req.user!.tipo === 'psicologo') {
            const psicologoProfile = await getPsicologoByUserId(req.user!.id);
            if (!psicologoProfile || psicologoProfile._id.toString() !== psicologoId) {
                return res.status(403).json({ error: 'Acesso negado: não pode ver consultas de outro psicólogo' });
            }
        }

        const consultas = await Consulta.find({ psicologo: psicologoId })
            .populate({ path: 'paciente', populate: { path: 'user', select: 'nome email' } })
            .populate({ path: 'psicologo', populate: { path: 'user', select: 'nome email' } });
        res.json(consultas);
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

// ─── GET /api/consultas/paciente/:pacienteId ───────────────────────────────────
// Paciente: only their own. Psicologo: only their own consultas with that patient.
// Must come before /:id.
router.get('/paciente/:pacienteId', verifyToken, verifyTokenByRole('psicologo', 'paciente', 'admin'), async (req: Request, res: Response) => {
    try {
        const { pacienteId } = req.params;
        if (!isValidObjectId(pacienteId)) {
            return res.status(400).json({ error: 'ID de paciente inválido' });
        }

        const filter: Record<string, unknown> = { paciente: pacienteId };

        if (req.user!.tipo === 'paciente') {
            const pacienteProfile = await getPacienteByUserId(req.user!.id);
            if (!pacienteProfile || pacienteProfile._id.toString() !== pacienteId) {
                return res.status(403).json({ error: 'Acesso negado: não pode ver consultas de outro paciente' });
            }
        }

        if (req.user!.tipo === 'psicologo') {
            const psicologoProfile = await getPsicologoByUserId(req.user!.id);
            if (!psicologoProfile) {
                return res.status(404).json({ error: 'Perfil de psicólogo não encontrado' });
            }
            filter['psicologo'] = psicologoProfile._id;
        }

        const consultas = await Consulta.find(filter)
            .populate({ path: 'paciente', populate: { path: 'user', select: 'nome email' } })
            .populate({ path: 'psicologo', populate: { path: 'user', select: 'nome email' } });
        res.json(consultas);
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

// ─── GET /api/consultas/:id ────────────────────────────────────────────────────
// Psicologo: only if theirs. Paciente: only if theirs. Admin: any.
router.get('/:id', verifyToken, verifyTokenByRole('psicologo', 'paciente', 'admin'), async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        if (!isValidObjectId(id)) {
            return res.status(400).json({ error: 'ID de consulta inválido' });
        }

        const consulta = await Consulta.findById(id)
            .populate({ path: 'paciente', populate: { path: 'user', select: 'nome email' } })
            .populate({ path: 'psicologo', populate: { path: 'user', select: 'nome email' } });
        if (!consulta) {
            return res.status(404).json({ error: 'Consulta não encontrada' });
        }

        if (req.user!.tipo === 'psicologo') {
            const psicologoProfile = await getPsicologoByUserId(req.user!.id);
            if (!psicologoProfile || consulta.psicologo._id.toString() !== psicologoProfile._id.toString()) {
                return res.status(403).json({ error: 'Acesso negado: consulta não pertence a este psicólogo' });
            }
        }

        if (req.user!.tipo === 'paciente') {
            const pacienteProfile = await getPacienteByUserId(req.user!.id);
            if (!pacienteProfile || consulta.paciente._id.toString() !== pacienteProfile._id.toString()) {
                return res.status(403).json({ error: 'Acesso negado: consulta não pertence a este paciente' });
            }
        }

        res.json(consulta);
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

// ─── PUT /api/consultas/:id ────────────────────────────────────────────────────
// Psicologo: must own the consulta. Admin: any consulta (e.g. to change `estado`).
router.put('/:id', verifyToken, verifyTokenByRole('psicologo', 'admin'), async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        if (!isValidObjectId(id)) {
            return res.status(400).json({ error: 'ID de consulta inválido' });
        }

        const existing = await Consulta.findById(id);
        if (!existing) {
            return res.status(404).json({ error: 'Consulta não encontrada' });
        }

        if (req.user!.tipo === 'psicologo') {
            const psicologoProfile = await getPsicologoByUserId(req.user!.id);
            if (!psicologoProfile) {
                return res.status(404).json({ error: 'Perfil de psicólogo não encontrado' });
            }
            if (existing.psicologo.toString() !== psicologoProfile._id.toString()) {
                return res.status(403).json({ error: 'Acesso negado: consulta não pertence a este psicólogo' });
            }
        }

        if (req.body.data !== undefined && !isTodayOrFuture(req.body.data)) {
            return res.status(400).json({ error: 'Não é possível reagendar uma consulta para uma data que já passou' });
        }

        if (req.body.data !== undefined && !isNowOrFuture(req.body.data)) {
            return res.status(400).json({ error: 'Não é possível reagendar uma consulta para uma hora que já passou' });
        }

        if (req.body.data !== undefined) {
            const duracao = req.body.duracao !== undefined ? req.body.duracao : existing.duracao;
            if (!isWithinClinicHours(req.body.data, duracao)) {
                return res.status(400).json({ error: 'A consulta deve ser agendada entre as 9:00 e as 19:00' });
            }
            if (!isWeekday(req.body.data)) {
                return res.status(400).json({ error: 'Não é possível agendar consultas ao fim de semana' });
            }
        }

        const consulta = await Consulta.findByIdAndUpdate(id, req.body, { new: true, runValidators: true })
            .populate({ path: 'paciente', populate: { path: 'user', select: 'nome email' } })
            .populate({ path: 'psicologo', populate: { path: 'user', select: 'nome email' } });

        // ── Chat notification ───────────────────────────────────────────────────
        // If the consulta has just been cancelled, post an automatic message in
        // the chat informing the patient.
        if (req.body.estado === 'cancelada' && existing.estado !== 'cancelada') {
            const dataConsulta = new Date(consulta.data);
            const pad = (n: number) => String(n).padStart(2, '0');
            const anoCurto = String(dataConsulta.getFullYear()).slice(-2);
            const dataFormatada = `${pad(dataConsulta.getDate())}/${pad(dataConsulta.getMonth() + 1)}/${anoCurto}, ${pad(dataConsulta.getHours())}:${pad(dataConsulta.getMinutes())}`;
            await Mensagem.create({
                paciente: consulta.paciente._id,
                psicologo: consulta.psicologo._id,
                remetente: 'psicologo',
                tipo: 'consulta_cancelada',
                consulta: consulta._id,
                consultaData: consulta.data,
                consultaDuracao: consulta.duracao,
                mensagem: `A consulta de ${dataFormatada} foi cancelada.`,
            });
        }

        res.json(consulta);
    } catch (error) {
        res.status(400).json({ error: (error as Error).message });
    }
});

// ─── DELETE /api/consultas/:id ─────────────────────────────────────────────────
// Psicologo: must own the consulta. Admin: any consulta.
router.delete('/:id', verifyToken, verifyTokenByRole('psicologo', 'admin'), async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        if (!isValidObjectId(id)) {
            return res.status(400).json({ error: 'ID de consulta inválido' });
        }

        const existing = await Consulta.findById(id);
        if (!existing) {
            return res.status(404).json({ error: 'Consulta não encontrada' });
        }

        if (req.user!.tipo === 'psicologo') {
            const psicologoProfile = await getPsicologoByUserId(req.user!.id);
            if (!psicologoProfile) {
                return res.status(404).json({ error: 'Perfil de psicólogo não encontrado' });
            }
            if (existing.psicologo.toString() !== psicologoProfile._id.toString()) {
                return res.status(403).json({ error: 'Acesso negado: consulta não pertence a este psicólogo' });
            }
        }

        await Consulta.findByIdAndDelete(id);
        res.json({ message: 'Consulta removida com sucesso' });
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

module.exports = { consultaRoutes: router };
