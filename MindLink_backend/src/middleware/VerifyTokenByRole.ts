import { Request, Response, NextFunction } from 'express';

export const verifyTokenByRole = (...roles: string[]) => {
    return (req: Request, res: Response, next: NextFunction): void => {
        const user = req.user;

        if (!user) {
            res.status(401).json({ error: 'Não autenticado' });
            return;
        }

        if (!roles.includes(user.tipo)) {
            res.status(403).json({ error: 'Acesso negado: não tem permissão para este recurso' });
            return;
        }

        next();
    };
};
