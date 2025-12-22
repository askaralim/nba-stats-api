/**
 * OpenAI Service for Game Summary Generation
 * Uses api2d for OpenAI API access
 * Two-step process: 1) Analyze data → JSON, 2) Generate summary from JSON
 */

const axios = require('axios');

class OpenAIService {
  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY;
    this.baseURL = process.env.OPENAI_BASE_URL || 'https://openai.api2d.net/v1';
    this.model = process.env.GPT_MODEL || 'gpt-3.5-turbo';
    this.maxTokens = parseInt(process.env.GPT_MAX_TOKENS || '500');
    this.temperature = parseFloat(process.env.GPT_TEMPERATURE || '0.7');
  }

  /**
   * Step 1: Analyze game data and return structured JSON
   * @param {Object} gameFacts - Structured game facts
   * @returns {Promise<Object>} Analysis JSON
   */
  async analyzeGameData(gameFacts) {
    if (!this.apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    const prompt = this.buildAnalysisPrompt(gameFacts);
console.log('step 1 prompt', prompt);
    try {
      const response = await axios.post(
        `${this.baseURL}/chat/completions`,
        {
          model: this.model,
          messages: [
            {
              role: 'system',
              content: '你是一个比赛数据分析引擎，而不是解说员。'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.3, // Lower temperature for more deterministic analysis
          max_tokens: 800,
          response_format: { type: 'json_object' }
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );

      const content = response.data?.choices?.[0]?.message?.content?.trim();
      if (!content) {
        throw new Error('Empty response from OpenAI');
      }

      // Parse JSON response
      const analysis = JSON.parse(content);
      return analysis;
    } catch (error) {
      console.error('OpenAI analysis error:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Step 2: Generate summary text from analysis JSON
   * @param {Object} analysis - Analysis JSON from step 1
   * @returns {Promise<string>} Generated summary text
   */
  async generateSummaryFromAnalysis(analysis) {
    if (!this.apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    const prompt = this.buildSummaryPrompt(analysis);
console.log('step 2 prompt', prompt);
    try {
      const response = await axios.post(
        `${this.baseURL}/chat/completions`,
        {
          model: this.model,
          messages: [
            {
              role: 'system',
              content: '你是一名数据型比赛解说员。'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: this.temperature,
          max_tokens: this.maxTokens
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );

      const summary = response.data?.choices?.[0]?.message?.content?.trim();
      if (!summary) {
        throw new Error('Empty response from OpenAI');
      }
console.log('step 2 summary', summary);
      return summary;
    } catch (error) {
      console.error('OpenAI summary error:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Generate game summary using two-step process
   * @param {Object} gameFacts - Structured game facts
   * @returns {Promise<string>} Generated summary text
   */
  async generateGameSummary(gameFacts) {
    try {
      // Step 1: Analyze data and get JSON
      const analysis = await this.analyzeGameData(gameFacts);
      console.log('step 1 analysis', analysis);
      
      // Step 2: Generate summary from analysis
      const summary = await this.generateSummaryFromAnalysis(analysis);
      
      return summary;
    } catch (error) {
      console.error('Two-step AI summary generation failed:', error.message);
      throw error;
    }
  }

  /**
   * Build Step 1 prompt: Data analysis
   * @param {Object} gameFacts - Structured game facts
   * @returns {string} Formatted prompt
   */
  buildAnalysisPrompt(gameFacts) {
    const {
      home_team,
      away_team,
      home_score,
      away_score,
      home_half,
      away_half,
      q1,
      q2,
      q3,
      q4,
      fg_home,
      fg_away,
      three_home,
      three_away,
      to_home,
      to_away,
      reb_home,
      reb_away,
      has_overtime,
      overtime_periods
    } = gameFacts;

    // Build overtime section if applicable
    let overtimeSection = '';
    if (has_overtime && overtime_periods && overtime_periods.length > 0) {
      const otScores = overtime_periods.map(ot => `OT${ot.period}: ${ot.score}`).join('\n  ');
      overtimeSection = `- 加时赛比分：\n  ${otScores}\n`;
    }

    return `请根据以下比赛数据，进行严格的数据对比分析，并以 JSON 格式输出结果。

【分析规则】
1. 只能使用给定数据，禁止推断或补充
2. 标记主队是否在以下方面占优：
   - 篮板
   - 失误（更少为占优）
   - 投篮命中率
   - 三分命中数
3. 判断比赛走势：
   - 上半场领先方
   - 下半场净胜方
   - 是否进入加时
4. 判断是否存在"明确胜因"：
   - 若仅有 1 项轻微优势，标记为"胜负接近"
5. 不使用任何主观或修饰性语言

【输出 JSON 结构】
{
  "home": "GSW",
  "away": "LAL",
  "winner": "home/away",
  "halftime_leader": "home/away/tie",
  "second_half_net_winner": "home/away/tie",
  "overtime": true/false,
  "advantages": {
    "rebounds": "home/away/none",
    "rebounds_home": number,
    "rebounds_away": number,
    "turnovers": "home/away/none",
    "turnovers_home": number,
    "turnovers_away": number,
    "fg": "home/away/none",
    "fg_home_made": number,
    "fg_away_made": number,
    "fg_home_attempted": number,
    "fg_away_attempted": number,
    "fg_home_percentage": number,
    "fg_away_percentage": number,
    "three": "home/away/none",
    "three_pt_home_made": number,
    "three_pt_away_made": number,
    "three_pt_home_attempted": number,
    "three_pt_away_attempted": number,
    "three_pt_home_percentage": number,
    "three_pt_away_percentage": number,
  },
  "decisive_factors": [decisive_factor1, decisive_factor2, ...],
  "close_game": true/false
}

比赛数据：
- 主队：${home_team}
- 客队：${away_team}
- 最终比分：${home_score} - ${away_score}
- 半场比分：${home_half} - ${away_half}
- 每节比分：
  Q1: ${q1}
  Q2: ${q2}
  Q3: ${q3}
  Q4: ${q4}
${overtimeSection}- 投篮命中率（主/客）：${fg_home}% / ${fg_away}%
- 三分命中数（主/客）：${three_home} / ${three_away}
- 失误（主/客）：${to_home} / ${to_away}
- 篮板（主/客）：${reb_home} / ${reb_away}`;
  }

  /**
   * Build Step 2 prompt: Generate summary from analysis
   * @param {Object} analysis - Analysis JSON from step 1
   * @returns {string} Formatted prompt
   */
  buildSummaryPrompt(analysis) {
    const analysisJson = JSON.stringify(analysis, null, 2);

    return `请严格根据以下分析结果，用中文总结比赛。

【写作规则】
1. 只能使用提供的分析结论，禁止自行推断
2. 若 close_game 为 true，必须明确说明"胜负取决于细节"
3. 只能将 decisive_factors 中的数据作为胜因
4. 若有加时赛，只能描述加时比分差异
5. 禁止使用情绪化或主观词语
6. 字数 60–120 字

【分析结果】
${analysisJson}`;
  }
}

module.exports = new OpenAIService();
