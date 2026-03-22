export async function onRequest(context) {
    // BUDGET_KV — это название привязки, которую мы зададим в админке Cloudflare
    const { request, env } = context;

    if (request.method === "GET") {
        // Читаем данные из базы
        const data = await env.BUDGET_KV.get("budget_data");
        return new Response(data || "{}", {
            headers: { "Content-Type": "application/json" }
        });
    }

    if (request.method === "POST") {
        // Записываем новые данные в базу
        const newData = await request.text();
        await env.BUDGET_KV.put("budget_data", newData);
        return new Response(JSON.stringify({ success: true }), {
            headers: { "Content-Type": "application/json" }
        });
    }

    return new Response("Method not allowed", { status: 405 });
}