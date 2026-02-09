
let logEnabled = false;

export function setVerbose(enabled: boolean) {
  logEnabled = enabled;
}

export function log(message: string, data: any = null) {
  if (logEnabled) {
    const timestamp = new Date().toISOString();
    if (data !== null && data !== undefined) {
      console.error(`[${timestamp}] [LOG] ${message}:`, data instanceof Error ? data : (typeof data === 'string' ? data : JSON.stringify(data, null, 2)));
    } else {
      console.error(`[${timestamp}] [LOG] ${message}`);
    }
  }
}

export function error(message: string, err: any = null) {
  // Errors should probably always be logged to stderr if they occur in the server
  const timestamp = new Date().toISOString();
  if (err !== null && err !== undefined) {
    console.error(`[${timestamp}] [ERROR] ${message}:`, err instanceof Error ? err : (typeof err === 'string' ? err : JSON.stringify(err, null, 2)));
  } else {
    console.error(`[${timestamp}] [ERROR] ${message}`);
  }
}
