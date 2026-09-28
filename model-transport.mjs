// Read OpenAI-compatible SSE responses as completed JSON with normal TLS verification.
export async function completionFetch(url, options) {
  const body = JSON.parse(options.body);
  body.stream = true;
  body.stream_options = { include_usage: true };
  try {
    const response = await fetch(url, { ...options, body: JSON.stringify(body) });
    if (!response.ok || !response.headers.get('content-type')?.includes('text/event-stream')) return response;
    const result = { choices: [{ message: { content: '' }, finish_reason: null }] };
    const reader = response.body.getReader(), decoder = new TextDecoder();
    let buffer = '', ended = false;
    const consume = line => {
      if (!line.startsWith('data:')) return;
      const data = line.slice(5).trim();
      if (!data) return;
      if (data === '[DONE]') { ended = true; return; }
      const event = JSON.parse(data);
      if (event.error) throw new Error('Streaming provider error: ' + (event.error.message || event.error.code || 'unknown'));
      if (event.model) result.model = event.model;
      if (event.usage) result.usage = event.usage;
      const choice = event.choices?.[0];
      if (choice?.delta?.content) result.choices[0].message.content += choice.delta.content;
      if (choice?.finish_reason) result.choices[0].finish_reason = choice.finish_reason;
    };
    while (true) {
      const chunk = await reader.read();
      buffer += decoder.decode(chunk.value, { stream: !chunk.done });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) consume(line.replace(/\r$/, ''));
      if (chunk.done) break;
    }
    if (buffer.trim()) consume(buffer);
    if (!ended && !result.choices[0].finish_reason) throw new Error('Streaming response ended before completion');
    return new Response(JSON.stringify(result), { status: response.status, headers: { 'Content-Type': 'application/json' } });
  } catch (error) {
    throw error;
  }
}
