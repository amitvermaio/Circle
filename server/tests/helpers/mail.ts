type TestMail = { to: string; html: string };

const messages = new Map<string, string>();

export async function captureMail({ to, html }: TestMail): Promise<void> {
  messages.set(to, html);
}

export function takeRegistrationOtp(email: string): string {
  const html = messages.get(email);
  messages.delete(email);
  const code = html?.match(/<strong>(\d{6})<\/strong>/)?.[1];
  if (!code) throw new Error("The registration email did not contain a six-digit code");
  return code;
}

export function clearCapturedMail(): void {
  messages.clear();
}
