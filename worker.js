export default {
  async fetch(request, env) {
    // 设置 CORS 头
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    // 处理模型列表请求
    if ((path === '/models' || path === '/v1/models') && request.method === 'GET') {
      const models = {
        object: "list",
        data: [
          {
            id: "gemini-pro",
            object: "model",
            created: 1677610602,
            owned_by: "google"
          }
        ]
      };
      return new Response(JSON.stringify(models), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    // 处理聊天请求
    if ((path === '/chat/completions' || path === '/v1/chat/completions') && request.method === 'POST') {
      try {
        const requestData = await request.json();
        const { messages } = requestData;
        
        if (!messages) {
          return new Response(JSON.stringify({ error: 'No messages provided' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const prompt = messages.map(msg => `${msg.role}: ${msg.content}`).join('\n');
        const apiKey = env.GEMINI_API_KEY; // 从环境变量获取
        
        const geminiResponse = await fetch(
          `https://generativelanguage.googleapis.com/v1/models/gemini-pro:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 2048,
              }
            })
          }
        );

        if (!geminiResponse.ok) {
          return new Response(JSON.stringify({ 
            error: `Gemini API error: ${geminiResponse.status}` 
          }), {
            status: geminiResponse.status,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const geminiData = await geminiResponse.json();
        const text = geminiData.candidates[0].content.parts[0].text;

        const openAIResponse = {
          id: 'chatcmpl-' + Date.now(),
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model: 'gemini-pro',
          choices: [{
            message: {
              role: 'assistant',
              content: text
            },
            finish_reason: 'stop'
          }]
        };

        return new Response(JSON.stringify(openAIResponse), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

      } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    return new Response(JSON.stringify({ error: 'Endpoint not found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
};
