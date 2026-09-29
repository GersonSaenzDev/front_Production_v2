// src/app/theme/layout/admin/navigation/time-24.directive.ts
import { Directive, ElementRef, forwardRef, HostListener, inject } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

/** 'HH:mm' en formato militar (00:00 – 23:59). */
export const TIME_24_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Campo de hora militar (24h) con máscara: el usuario digita solo números y los dos
 * puntos se insertan solos ('1420' -> '14:20'). Al salir del campo completa formatos
 * cortos ('7' -> '07:00', '730' -> '07:30').
 *
 * Reemplaza a input type="time", que en Chrome sigue el formato regional del equipo
 * (12h a. m./p. m.) y no se puede forzar a 24h.
 *
 * Uso: <input type="text" appTime24 formControlName="horaInicio"> (o [(ngModel)]).
 */
@Directive({
  selector: 'input[appTime24]',
  standalone: true,
  host: {
    inputmode: 'numeric',
    maxlength: '5',
    autocomplete: 'off',
    placeholder: 'HH:mm (24h)'
  },
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => Time24Directive), multi: true }]
})
export class Time24Directive implements ControlValueAccessor {
  private el = inject<ElementRef<HTMLInputElement>>(ElementRef);
  private onChange: (value: string) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  writeValue(value: string | null): void {
    this.el.nativeElement.value = value || '';
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.el.nativeElement.disabled = isDisabled;
  }

  @HostListener('input')
  onInput(): void {
    const digits = this.el.nativeElement.value.replace(/\D/g, '').slice(0, 4);
    const masked = digits.length > 2 ? `${digits.slice(0, 2)}:${digits.slice(2)}` : digits;
    this.el.nativeElement.value = masked;
    this.onChange(masked);
  }

  @HostListener('blur')
  onBlur(): void {
    const digits = this.el.nativeElement.value.replace(/\D/g, '');
    let normalized = this.el.nativeElement.value;
    if (digits.length === 1 || digits.length === 2) normalized = `${digits.padStart(2, '0')}:00`;
    else if (digits.length === 3) normalized = `0${digits[0]}:${digits.slice(1)}`;
    if (normalized !== this.el.nativeElement.value) {
      this.el.nativeElement.value = normalized;
      this.onChange(normalized);
    }
    this.onTouched();
  }
}
