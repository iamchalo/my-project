// Client-side only QZ Tray helper — never import on SSR
let qz: any = null;

async function loadQZ(): Promise<any> {
  if (qz) return qz;
  try {
    const mod = await import('qz-tray');
    qz = mod.default ?? mod;
    return qz;
  } catch {
    return null;
  }
}

export async function connect(): Promise<boolean> {
  try {
    const lib = await loadQZ();
    if (!lib) return false;

    if (lib.websocket.isActive()) return true;

    await Promise.race([
      lib.websocket.connect(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), 3000)
      ),
    ]);
    return true;
  } catch {
    return false;
  }
}

export function isConnected(): boolean {
  try {
    return qz?.websocket?.isActive?.() ?? false;
  } catch {
    return false;
  }
}

export async function getPrinters(): Promise<string[]> {
  try {
    const lib = await loadQZ();
    if (!lib || !lib.websocket.isActive()) return [];
    const printers = await lib.printers.find();
    return Array.isArray(printers) ? printers : [printers];
  } catch {
    return [];
  }
}

export async function printReceipt(printerName: string, lines: string[]): Promise<void> {
  try {
    const lib = await loadQZ();
    if (!lib || !lib.websocket.isActive()) return;

    const config = lib.configs.create(printerName);
    const data = [
      ...lines.map((line) => ({ type: 'raw', format: 'plain', data: line + '\n' })),
      // ESC/POS full paper cut command (1B 69)
      { type: 'raw', format: 'hex', data: '1B69' },
    ];
    await lib.print(config, data);
  } catch (err) {
    console.warn('QZ Tray print error:', err);
  }
}

export async function disconnect(): Promise<void> {
  try {
    if (qz?.websocket?.isActive?.()) {
      await qz.websocket.disconnect();
    }
  } catch {
    // ignore
  }
}
