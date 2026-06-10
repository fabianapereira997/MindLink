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
  psychologists = [
    {
      name: 'João Silva',
      specialty: 'Psicologia Clínica',
      photo: '/joao_silva.jpg',
    },
    {
      name: 'Pedro Ramos',
      specialty: 'Psicoterapia Educacional',
      photo: '/pedro_ramos.jpg',
    },
    {
      name: 'Tomás Santos',
      specialty: 'Psicologia Clínica',
      photo: '/tomas_santos.jpg',
    },
  ];

  clinics = [
    {
      name: 'CentroMente Lisboa',
      address: 'Av. da Liberdade, 120, 1250-096 Lisboa',
      email: 'geral@centromente.pt',
      phone: '+351 213 456 789',
    },
    {
      name: 'Clínica SaudePS Porto',
      address: 'Rua de Santa Catarina, 85, 4000-447 Porto',
      email: 'contacto@saudeps.pt',
      phone: '+351 222 345 678',
    },
    {
      name: 'PsicoVida Coimbra',
      address: 'Rua Padre António Vieira, 34, 3000-311 Coimbra',
      email: 'info@psicovida.pt',
      phone: '+351 239 567 890',
    },
    {
      name: 'MenteAberta Braga',
      address: 'Praça da República, 12, 4710-229 Braga',
      email: 'apoio@menteaberta.pt',
      phone: '+351 253 678 901',
    },
    {
      name: 'Equilíbrio Mental Setúbal',
      address: 'Rua do Bocage, 56, 2900-194 Setúbal',
      email: 'geral@equilibriomental.pt',
      phone: '+351 265 789 012',
    },
    {
      name: 'Harmonia Psicológica Faro',
      address: 'Rua de Santo António, 78, 8000-282 Faro',
      email: 'geral@harmoniapsicologica.pt',
      phone: '+351 289 890 123',
    },
  ];
}



