import express, { Express, Request, Response } from 'express';
import cors = require('cors');

const { userRoutes }         = require('./routes/UserRoutes');
const { psicologoRoutes }    = require('./routes/PsicologoRoutes');
const { pacienteRoutes }     = require('./routes/PacienteRoutes');
const { questionarioRoutes } = require('./routes/QuestionarioRoutes');
const { consultaRoutes }     = require('./routes/ConsultaRoutes');
const { desafioRoutes }      = require('./routes/DesafioRoutes');
const { mensagemRoutes }     = require('./routes/MensagemRoutes');
const { alertaRoutes }       = require('./routes/AlertaRoutes');
const { analiseRoutes }      = require('./routes/AnaliseRoutes');

import { errorHandler } from './middleware/errorHandler';

export function createApp(): Express {
    const app = express();

    // Middleware
    app.use(cors());
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    // Health check
    app.get('/api/health', (_req: Request, res: Response) => {
        res.json({ status: 'ok' });
    });

    // Routes
    app.use('/api/users',         userRoutes);
    app.use('/api/psicologos',    psicologoRoutes);
    app.use('/api/pacientes',     pacienteRoutes);
    app.use('/api/questionarios', questionarioRoutes);
    app.use('/api/consultas',     consultaRoutes);
    app.use('/api/desafios',      desafioRoutes);
    app.use('/api/mensagens',     mensagemRoutes);
    app.use('/api/alertas',       alertaRoutes);
    app.use('/api/analise',       analiseRoutes);

    // 404 catch-all
    app.use((_req: Request, res: Response) => {
        res.status(404).json({ error: 'Rota não encontrada' });
    });

    // Centralised error handler (must be last)
    app.use(errorHandler);

    return app;
}
