export async function GET(): Promise<Response> {
  return Response.json({
    status: "ok",
    service: "repocop",
    version: process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0",
    timestamp: new Date().toISOString(),
  });
}
