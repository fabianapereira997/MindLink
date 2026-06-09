import { Component, inject, OnInit, signal, ElementRef, ViewChild, AfterViewInit } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { AdminService, AdminStats } from '../../../core/services/admin.service';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, DatePipe],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class AdminDashboardComponent implements OnInit, AfterViewInit {
  @ViewChild('patientsChart') patientsChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('consultasChart') consultasChartRef!: ElementRef<HTMLCanvasElement>;

  auth          = inject(AuthService);
  private adminSvc = inject(AdminService);

  stats   = signal<AdminStats | null>(null);
  loading = signal(true);
  error   = signal<string | null>(null);

  private viewReady = false;
  private charts: Chart[] = [];

  ngOnInit(): void {
    this.adminSvc.getStats().subscribe({
      next: s => {
        this.stats.set(s);
        this.loading.set(false);
        if (this.viewReady) setTimeout(() => this.renderCharts(), 0);
      },
      error: err => {
        this.loading.set(false);
        this.error.set(err.error?.error ?? 'Erro ao carregar estatísticas.');
      },
    });
  }

  ngAfterViewInit(): void {
    this.viewReady = true;
    if (!this.loading()) setTimeout(() => this.renderCharts(), 0);
  }

  moodColor(v: number): string {
    if (v >= 4.5) return '#26874E';
    if (v >= 3.5) return '#73C883';
    if (v >= 2.5) return '#eab308';
    if (v >= 1.5) return '#f97316';
    return '#dc2626';
  }

  private renderCharts(): void {
    const s = this.stats();
    if (!s) return;

    this.charts.forEach(c => c.destroy());
    this.charts = [];

    // ── Patients per psychologist ──────────────────────────────────────────────
    if (this.patientsChartRef) {
      this.charts.push(new Chart(this.patientsChartRef.nativeElement, {
        type: 'bar',
        data: {
          labels: s.patientsByPsicologo.map(p => p.nome),
          datasets: [{
            label: 'Pacientes',
            data: s.patientsByPsicologo.map(p => p.count),
            backgroundColor: 'rgba(38,135,78,0.7)',
            borderColor: '#26874E',
            borderWidth: 1,
            borderRadius: 6,
          }],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            y: { beginAtZero: true, ticks: { stepSize: 1, font: { family: 'Inter' } }, grid: { color: 'rgba(0,0,0,0.05)' } },
            x: { ticks: { font: { family: 'Inter' } }, grid: { display: false } },
          },
        },
      }));
    }

    // ── Consultations per psychologist ─────────────────────────────────────────
    if (this.consultasChartRef) {
      this.charts.push(new Chart(this.consultasChartRef.nativeElement, {
        type: 'bar',
        data: {
          labels: s.consultasByPsicologo.map(p => p.nome),
          datasets: [
            { label: 'Realizadas', data: s.consultasByPsicologo.map(p => p.realizadas), backgroundColor: 'rgba(38,135,78,0.7)', borderRadius: 4 },
            { label: 'Agendadas',  data: s.consultasByPsicologo.map(p => p.agendadas),  backgroundColor: 'rgba(234,179,8,0.7)', borderRadius: 4 },
            { label: 'Canceladas', data: s.consultasByPsicologo.map(p => p.canceladas), backgroundColor: 'rgba(220,38,38,0.6)', borderRadius: 4 },
          ],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { position: 'top', labels: { font: { family: 'Inter', size: 12 } } } },
          scales: {
            y: { beginAtZero: true, ticks: { stepSize: 1, font: { family: 'Inter' } }, grid: { color: 'rgba(0,0,0,0.05)' } },
            x: { ticks: { font: { family: 'Inter' } }, grid: { display: false } },
          },
        },
      }));
    }
  }
}
