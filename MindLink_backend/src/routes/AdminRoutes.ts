import { Request, Response } from 'express';
import { isValidObjectId } from '../utils/helpers';

const express    = require('express');
const router     = express.Router();
const User       = require('../models/user');
const Psicologo  = require('../models/psicologo');
const Paciente   = require('../models/paciente');
const Consulta   = require('../models/consulta');
const Questionario = require('../models/questionario');
const bcrypt     = require('bcryptjs');
const { verifyToken }       = require('../middleware/VerifyToken');
const { verifyTokenByRole } = require('../middleware/VerifyTokenByRole');

// All routes require authentication + admin role
const adminOnly = [verifyToken, verifyTokenByRole('admin')];

// ─── GET /api/admin/stats ──────────────────────────────────────────────────────
// Returns a comprehensive stats object for the admin dashboard.
router.get('/stats', adminOnly, async (_req: Request, res: Response) => {
    try {
        const [psicologos, pacientes, consultas, questionarios] = await Promise.all([
            Psicologo.find().populate('user', 'nome email').lean(),
            Paciente.find()
                .populate('user', 'nome email createdAt')
                .populate({ path: 'psicologo', populate: { path: 'user', select: 'nome email' } })
                .lean(),
            Consulta.find()
                .populate({ path: 'psicologo', populate: { path: 'user', select: 'nome' } })
                .populate({ path: 'paciente', populate: { path: 'user', select: 'nome' } })
                .lean(),
            Questionario.find().lean(),
        ]);

        // ── Patients per psychologist ──────────────────────────────────────────
        const patientsByPsicologo = psicologos.map((ps: any) => {
            const count = pacientes.filter(
                (p: any) => p.psicologo?._id?.toString() === ps._id.toString()
            ).length;
            return { psicologoId: ps._id, nome: ps.user?.nome ?? 'Desconhecido', count };
        });

        // ── Consultations per psychologist ─────────────────────────────────────
        const consultasByPsicologo = psicologos.map((ps: any) => {
            const psConsultas = consultas.filter(
                (c: any) => c.psicologo?._id?.toString() === ps._id.toString()
            );
            return {
                psicologoId: ps._id,
                nome: ps.user?.nome ?? 'Desconhecido',
                total: psConsultas.length,
                realizadas: psConsultas.filter((c: any) => c.estado === 'realizada').length,
                agendadas:  psConsultas.filter((c: any) => c.estado === 'agendada').length,
                canceladas: psConsultas.filter((c: any) => c.estado === 'cancelada').length,
            };
        });

        // ── Average mood per psychologist ──────────────────────────────────────
        const moodByPsicologo = psicologos.map((ps: any) => {
            const psPatientIds = pacientes
                .filter((p: any) => p.psicologo?._id?.toString() === ps._id.toString())
                .map((p: any) => p._id.toString());
            const psQuestionarios = questionarios.filter(
                (q: any) => psPatientIds.includes(q.paciente?.toString())
            );
            const avg = psQuestionarios.length
                ? (psQuestionarios.reduce((s: number, q: any) => s + q.humor, 0) / psQuestionarios.length).toFixed(1)
                : null;
            return { psicologoId: ps._id, nome: ps.user?.nome ?? 'Desconhecido', avgMood: avg, checks: psQuestionarios.length };
        });

        // ── Inactive patients (no check-in in last 7 days) ─────────────────────
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const activePatientIds = new Set(
            questionarios
                .filter((q: any) => new Date(q.data) >= sevenDaysAgo)
                .map((q: any) => q.paciente?.toString())
        );
        const inactivePatients = pacientes
            .filter((p: any) => !activePatientIds.has(p._id.toString()))
            .map((p: any) => ({
                _id: p._id,
                nome: p.user?.nome ?? 'Desconhecido',
                psicologo: p.psicologo?.user?.nome ?? 'Desconhecido',
            }));

        // ── Upcoming consultations (all, next 7 days) ──────────────────────────
        const now = new Date();
        const in7days = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        const upcoming = consultas
            .filter((c: any) => new Date(c.data) >= now && new Date(c.data) <= in7days && c.estado === 'agendada')
            .sort((a: any, b: any) => new Date(a.data).getTime() - new Date(b.data).getTime())
            .slice(0, 10);

        res.json({
            totals: {
                psicologos: psicologos.length,
                pacientes:  pacientes.length,
                consultas:  consultas.length,
                realizadas: consultas.filter((c: any) => c.estado === 'realizada').length,
                questionarios: questionarios.length,
            },
            patientsByPsicologo,
            consultasByPsicologo,
            moodByPsicologo,
            inactivePatients,
            upcoming,
        });
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

// ─── POST /api/admin/psicologos — create a psychologist user + profile ────────
// Creates both the User record and the Psicologo profile in one step.
router.post('/psicologos', adminOnly, async (req: Request, res: Response) => {
    try {
        const { nome, email, password, genero, data_nascimento, especialidade } = req.body;

        if (!nome || !email || !password) {
            return res.status(400).json({ error: 'nome, email e password são obrigatórios' });
        }

        const exists = await User.findOne({ email });
        if (exists) {
            return res.status(409).json({ error: 'Email já registado' });
        }

        const hashedPassword = await bcrypt.hash(password, 12);
        const user = await new User({
            nome,
            email,
            password: hashedPassword,
            genero: genero ?? 'outro',
            data_nascimento: data_nascimento ?? new Date('1990-01-01'),
            tipo: 'psicologo',
            mustChangePassword: true,
        }).save();

        const psicologo = await new Psicologo({ user: user._id, especialidade: especialidade ?? '' }).save();
        const populated  = await Psicologo.findById(psicologo._id).populate('user', '-password');
        res.status(201).json(populated);
    } catch (error) {
        res.status(400).json({ error: (error as Error).message });
    }
});

// ─── GET /api/admin/psicologos — all psychologists ────────────────────────────
router.get('/psicologos', adminOnly, async (_req: Request, res: Response) => {
    try {
        const psicologos = await Psicologo.find().populate('user', '-password').lean();

        // Attach patient count to each psychologist
        const pacientes = await Paciente.find().lean();
        const result = psicologos.map((ps: any) => ({
            ...ps,
            patientCount: pacientes.filter((p: any) => p.psicologo?.toString() === ps._id.toString()).length,
        }));

        res.json(result);
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

// ─── GET /api/admin/psicologos/:id — full psychologist profile ────────────────
router.get('/psicologos/:id', adminOnly, async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        if (!isValidObjectId(id)) return res.status(400).json({ error: 'ID inválido' });

        const psicologo = await Psicologo.findById(id).populate('user', '-password');
        if (!psicologo) return res.status(404).json({ error: 'Psicólogo não encontrado' });

        const pacientes = await Paciente.find({ psicologo: id })
            .populate('user', '-password').lean();

        const consultas = await Consulta.find({ psicologo: id })
            .populate({ path: 'paciente', populate: { path: 'user', select: 'nome' } }).lean();

        res.json({ psicologo, pacientes, consultas });
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

// ─── GET /api/admin/pacientes — all patients ──────────────────────────────────
router.get('/pacientes', adminOnly, async (_req: Request, res: Response) => {
    try {
        const pacientes = await Paciente.find()
            .populate('user', '-password')
            .populate({ path: 'psicologo', populate: { path: 'user', select: 'nome email' } })
            .lean();
        res.json(pacientes);
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

// ─── GET /api/admin/pacientes/:id — full patient profile ──────────────────────
router.get('/pacientes/:id', adminOnly, async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        if (!isValidObjectId(id)) return res.status(400).json({ error: 'ID inválido' });

        const paciente = await Paciente.findById(id)
            .populate('user', '-password')
            .populate({ path: 'psicologo', populate: { path: 'user', select: 'nome email' } });
        if (!paciente) return res.status(404).json({ error: 'Paciente não encontrado' });

        const [consultas, questionarios] = await Promise.all([
            Consulta.find({ paciente: id })
                .populate({ path: 'psicologo', populate: { path: 'user', select: 'nome' } })
                .sort({ data: -1 }).lean(),
            Questionario.find({ paciente: id }).sort({ data: -1 }).lean(),
        ]);

        res.json({ paciente, consultas, questionarios });
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

// ─── DELETE /api/admin/psicologos/:id — remove psychologist + user ────────────
router.delete('/psicologos/:id', adminOnly, async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        if (!isValidObjectId(id)) return res.status(400).json({ error: 'ID inválido' });

        const ps = await Psicologo.findById(id);
        if (!ps) return res.status(404).json({ error: 'Psicólogo não encontrado' });

        await Psicologo.findByIdAndDelete(id);
        await User.findByIdAndDelete(ps.user);
        res.json({ message: 'Psicólogo removido com sucesso' });
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

module.exports = { adminRoutes: router };
