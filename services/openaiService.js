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
      fg_home_made,
      fg_home_attempted,
      fg_home_percent,
      fg_away_made,
      fg_away_attempted,
      fg_away_percent,
      three_home_made,
      three_home_attempted,
      three_home_percent,
      three_away_made,
      three_away_attempted,
      three_away_percent,
      ft_home_made,
      ft_home_attempted,
      ft_home_percent,
      ft_away_made,
      ft_away_attempted,
      ft_away_percent,
      to_home,
      to_away,
      reb_home,
      reb_home_offensive,
      reb_home_defensive,
      reb_away,
      reb_away_offensive,
      reb_away_defensive,
      has_overtime,
      overtime_periods,
      largest_lead_home,
      largest_lead_away,
      foul_home,
      foul_away,
      points_in_paint_home,
      points_in_paint_away,
      fast_break_points_home,
      fast_break_points_away,
      turnover_points_home,
      turnover_points_away,
      halftime_leader,
      winner,
      top_scorer_home,
      top_scorer_away,
      top_points_home,
      top_points_away,
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
  "overtime": true/false,
  "advantages": {
    "rebounds": "home/away/none",
    "rebounds_home": number,
    "rebounds_away": number,
    "turnovers": "home/away/none",
    "turnovers_home": number,
    "turnovers_away": number,
    "fg_home_made": number,
    "fg_away_made": number,
    "fg_home_attempted": number,
    "fg_away_attempted": number,
    "fg_home_percentage": number,
    "fg_away_percentage": number,
    "three_pt_home_made": number,
    "three_pt_away_made": number,
    "three_pt_home_attempted": number,
    "three_pt_away_attempted": number,
    "three_pt_home_percentage": number,
    "three_pt_away_percentage": number,
    "ft_home_made": number,
    "ft_away_made": number,
    "ft_home_attempted": number,
    "ft_away_attempted": number,
    "ft_home_percentage": number,
    "ft_away_percentage": number,
    "points_in_paint_home": number,
    "points_in_paint_away": number,
    "fast_break_points_home": number,
    "fast_break_points_away": number,
    "turnover_points_home": number,
    "turnover_points_away": number,
    "largest_lead_home": number,
    "largest_lead_away": number,
    "foul_home": number,
    "foul_away": number,
    "decisive_factors": [decisive_factor1, decisive_factor2, ...],
    "close_game": true/false
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
${overtimeSection}
- 投篮命中数（主）：${fg_home_made} 投篮出手数：${fg_home_attempted}
- 投篮命中率（主）：${fg_home_percent}%
- 投篮命中数（客）：${fg_away_made} 投篮出手数：${fg_away_attempted}
- 投篮命中率（客）：${fg_away_percent}%
- 三分命中数（主）：${three_home_made} 三分出手数：${three_home_attempted}
- 三分命中率（主）：${three_home_percent}%
- 三分命中数（客）：${three_away_made} 三分出手数：${three_away_attempted}
- 三分命中率（客）：${three_away_percent}%
- 罚球命中数（主）：${ft_home_made} 罚球出手数：${ft_home_attempted}
- 罚球命中率（主）：${ft_home_percent}%
- 罚球命中数（客）：${ft_away_made} 罚球出手数：${ft_away_attempted}
- 罚球命中率（客）：${ft_away_percent}%
- 失误（主/客）：${to_home} / ${to_away}
- 篮板（主/客）：${reb_home} / ${reb_away}
- 篮板（主/客）：${reb_home_offensive} / ${reb_away_offensive}
- 篮板（主/客）：${reb_home_defensive} / ${reb_away_defensive}
- 最大领先（主/客）：${largest_lead_home} / ${largest_lead_away}
- 犯规（主/客）：${foul_home} / ${foul_away}
- 内线得分（主/客）：${points_in_paint_home} / ${points_in_paint_away}
- 快攻得分（主/客）：${fast_break_points_home} / ${fast_break_points_away}
- 失误得分（主/客）：${turnover_points_home} / ${turnover_points_away}
  `;}

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
6. 如果不能准确翻译球队名称，请使用球队英文名或简称。
7. 字数 60–120 字

【分析结果】
${analysisJson}`;
  }
}

module.exports = new OpenAIService();
