import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { Provider } from 'jotai';

import { ExcalidrawWrapper } from '../../App';
import { bootStateAtom } from '../../boards/host/boardState';
import { appJotaiStore } from '../../app-jotai';

// Mock board system init so we can control boot state via Jotai directly without race conditions
vi.mock('../../boards/host/boardService', async (importOriginal: any) => {
  const actual = await importOriginal();
  return {
    ...actual,
    initializeBoardSystem: vi.fn().mockReturnValue(new Promise(() => {})), 
  };
});

describe('Microphase 3: Bloqueo de UI durante boot', () => {
  beforeEach(() => {
    // Reset state before each test
    act(() => {
      appJotaiStore.set(bootStateAtom, 'booting');
    });
  });

  const renderComponent = () => {
    return render(
      <Provider store={appJotaiStore}>
        <ExcalidrawWrapper />
      </Provider>
    );
  };

  it('Test 1: booting -> editor bloqueado, overlay visible', async () => {
    act(() => { appJotaiStore.set(bootStateAtom, 'booting'); });
    renderComponent();
    expect(await screen.findByText('Cargando tablero...')).toBeDefined();
  });

  it('Test 2: failed -> editor bloqueado, overlay visible', async () => {
    act(() => { appJotaiStore.set(bootStateAtom, 'failed'); });
    renderComponent();
    expect(await screen.findByText('No se pudo cargar el tablero.')).toBeDefined();
  });

  it('Test 3: ready -> editor desbloqueado, overlay ausente', async () => {
    act(() => { appJotaiStore.set(bootStateAtom, 'ready'); });
    renderComponent();
    expect(screen.queryByText('Cargando tablero...')).toBeNull();
    expect(screen.queryByText('No se pudo cargar el tablero.')).toBeNull();
  });

  it('Test 4: booting -> ready elimina el bloqueo', async () => {
    act(() => { appJotaiStore.set(bootStateAtom, 'booting'); });
    renderComponent();
    expect(await screen.findByText('Cargando tablero...')).toBeDefined();

    act(() => { appJotaiStore.set(bootStateAtom, 'ready'); });
    expect(screen.queryByText('Cargando tablero...')).toBeNull();
  });

  it('Test 5: booting -> failed mantiene el bloqueo', async () => {
    act(() => { appJotaiStore.set(bootStateAtom, 'booting'); });
    renderComponent();
    
    act(() => { appJotaiStore.set(bootStateAtom, 'failed'); });
    expect(await screen.findByText('No se pudo cargar el tablero.')).toBeDefined();
    expect(screen.queryByText('Cargando tablero...')).toBeNull();
  });

  it('Test 6: failed no revive con interaccion de pointer', async () => {
    act(() => { appJotaiStore.set(bootStateAtom, 'failed'); });
    const { container } = renderComponent();

    // Simulate interactions that are blocked by the capture handlers
    const wrapper = container.querySelector('.excalidraw-app');
    
    // Simulate events
    fireEvent.pointerDown(wrapper!);
    fireEvent.wheel(wrapper!);
    fireEvent.drop(wrapper!);
    fireEvent.paste(wrapper!);

    // Should still be failed
    expect(appJotaiStore.get(bootStateAtom)).toBe('failed');
  });
});
