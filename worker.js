export default {
  async fetch(request, env) {
    console.log('环境变量检查开始');
    console.log('GEMINI_API_KEY 存在:', !!env.GEMINI_API_KEY);
    
    // 设置 CORS 头
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    // 处理预检请求
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    // 处理模型列表请求
    if ((path === '/models' || path === '/v1/models') && request.method === 'GET') {
      const modelsResponse = {
        object: "list",
        data: [
          {
            id: "gemini-1.0-pro",
            object: "model",
            created: 1677610602,
            owned_by: "google"
          },
          {
            id: "gemini-1.5-flash", 
            object: "model",
            created: 1677610602,
            owned_by: "google"
          },
          {
            id: "gemini-1.5-pro",
            object: "model",
            created: 1677610602,
            owned_by: "google"
          }
        ]
      };
      
      return new Response(JSON.stringify(modelsResponse), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 处理聊天请求
    if ((path === '/chat/completions' || path === '/v1/chat/completions') && request.method === 'POST') {
      try {
        // 详细的环境变量检查
        console.log('详细环境变量检查:');
        console.log('- env 对象:', typeof env);
        console.log('- env 键:', Object.keys(env));
        console.log('- GEMINI_API_KEY 存在:', !!env.GEMINI_API_KEY);
        console.log('- GEMINI_API_KEY 类型:', typeof env.GEMINI_API_KEY);
        
        if (!env.GEMINI_API_KEY) {
          console.error('错误: GEMINI_API_KEY 未设置或为空');
          return new Response(JSON.stringify({ 
            error: 'API key not configured in environment variables',
            details: {
              envKeys: Object.keys(env),
              geminiKeyExists: !!env.GEMINI_API_KEY,
              geminiKeyType: typeof env.GEMINI_API_KEY
            }
          }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const requestData = await request.json();
        const { messages } = requestData;
        
        if (!messages || !Array.isArray(messages)) {
          return new Response(JSON.stringify({ error: 'No messages provided' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // 构建提示
        const prompt = messages.map(msg => `${msg.role}: ${msg.content}`).join('\n');

        console.log('API 密钥长度:', env.GEMINI_API_KEY.length);
        console.log('调用 Gemini API...');

        // 使用 gemini-1.0-pro 模型，这是最稳定的
        const geminiResponse = await fetch(
          `https://generativelanguage.googleapis.com/v1/models/gemini-1.0-pro:generateContent?key=${env.GEMINI_API_KEY}`,
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

        console.log('Gemini API 响应状态:', geminiResponse.status);

        if (!geminiResponse.ok) {
          const errorText = await geminiResponse.text();
          console.error('Gemini API 错误:', errorText);
          return new Response(JSON.stringify({ 
            error: `Gemini API error: ${geminiResponse.status}`,
            details: errorText
          }), {
            status: geminiResponse.status,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const geminiData = await geminiResponse.json();
        
        if (!geminiData.candidates || !geminiData.candidates[0]) {
          return new Response(JSON.stringify({ error: 'No response from Gemini' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const text = geminiData.candidates[0].content.parts[0].text;

        // 转换为 OpenAI 格式
        const openAIResponse = {
          id: 'chatcmpl-' + Date.now(),
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model: 'gemini-1.0-pro',
          choices: [{
            index: 0,
            message: {
              role: 'assistant',
              content: text
            },
            finish_reason: 'stop'
          }],
          usage: {
            prompt_tokens: 0,
            completion_tokens: 0,
            total_tokens: 0
          }
        };

        console.log('成功返回响应');
        return new Response(JSON.stringify(openAIResponse), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

      } catch (error) {
        console.error('处理请求时出错:', error);
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // 处理根路径
    if (path === '/' && request.method === 'GET') {
      return new Response(JSON.stringify({ 
        status: 'Gemini Proxy is running',
        envCheck: {
          geminiApiKeyExists: !!env.GEMINI_API_KEY,
          allEnvKeys: Object.keys(env)
        }
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ error: 'Endpoint not found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
};
