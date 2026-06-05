import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './landing.html',
  styleUrl: './landing.css',
})
export class LandingComponent {
  features = [
    {
      title: 'Monitorização do Humor',
      desc: 'Registe como se sente diariamente e visualize a evolução ao longo do tempo com gráficos claros.',
    },
    {
      title: 'Ligação Psicólogo–Paciente',
      desc: 'Plataforma partilhada que aproxima psicólogos e pacientes, com dados clínicos acessíveis a quem importa.',
    },
    {
      title: 'Privado e Seguro',
      desc: 'Os seus dados são seus. Acesso restrito por funções e credenciais verificadas.',
    },
    {
      title: 'Registos Diários',
      desc: 'Questionários rápidos para construir um historial de saúde mental consistente e fiel.',
    },
    {
      title: 'Relatórios de Progresso',
      desc: 'Resumos semanais e mensais que destacam a evolução e os padrões de humor.',
    },
    {
      title: 'Consultas Integradas',
      desc: 'Acompanhe as suas consultas agendadas e o histórico de sessões com o seu psicólogo.',
    },
  ];
}
