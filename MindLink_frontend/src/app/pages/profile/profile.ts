import { Component, inject } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
  ],
  templateUrl: './profile.html',
  styleUrl: './profile.css',
})
export class ProfileComponent {
  private fb = inject(FormBuilder);

  form = this.fb.group({
    name: ['Tomás Barreira', [Validators.required]],
    email: ['tomasfragoso05@gmail.com', [Validators.required, Validators.email]],
    bio: ['Tracking my mental health one day at a time.'],
  });

  onSave() {
    if (this.form.valid) {
      console.log('Profile saved:', this.form.value);
    }
  }
}
