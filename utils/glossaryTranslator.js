/**
 * Glossary Translator Utility
 * Translates NBA stat abbreviations and terms to Chinese
 */

const glossaryMap = {
  // Common abbreviations
  'GP': '场次',
  'GS': '先发',
  'MIN': '时间',
  'FG': '出手',
  'FG%': '命中率',
  '3PT': '三分',
  '3P%': '三分%',
  'FT': '罚球',
  'FT%': '罚球%',
  'OR': '进攻篮板',
  'DR': '防守篮板',
  'REB': '篮板',
  'AST': '助攻',
  'BLK': '盖帽',
  'STL': '抢断',
  'PF': '犯规',
  'TO': '失误',
  'PTS': '得分',
  
  // Extended abbreviations
  '3-Point Field Goal Percentage': '三分命中率',
  '3-Point Field Goals Made-Attempted': '三分命中-出手',
  'Assists': '助攻',
  'Blocks': '盖帽',
  'Field Goals Made-Attempted': '投篮命中-出手',
  'Field Goal Percentage': '投篮命中率',
  'Free Throws Made-Attempted': '罚球命中-出手',
  'Free Throw Percentage': '罚球命中率',
  'Fouls': '犯规',
  'Minutes': '时间',
  'Offensive Rebounds': '进攻篮板',
  'Defensive Rebounds': '防守篮板',
  'Points': '得分',
  'Rebounds': '篮板',
  'Steals': '抢断',
  'Turnovers': '失误',
  
  // Display names
  'Minutes': '时间',
  'Field Goals Made-Attempted': '投篮',
  'Field Goal Percentage': '命中率',
  '3-Point Field Goals Made-Attempted': '三分',
  '3-Point Field Goal Percentage': '三分%',
  'Free Throws Made-Attempted': '罚球',
  'Free Throw Percentage': '罚球%',
  'Rebounds': '篮板',
  'Assists': '助攻',
  'Blocks': '盖帽',
  'Steals': '抢断',
  'Fouls': '犯规',
  'Turnovers': '失误',
  'Points': '得分'
};

/**
 * Translate a glossary term to Chinese
 * @param {string} term - The term to translate
 * @returns {string} Translated term or original if not found
 */
function translateGlossary(term) {
  if (!term) return term;
  
  // Try exact match first
  if (glossaryMap[term]) {
    return glossaryMap[term];
  }
  
  // Try case-insensitive match
  const lowerTerm = term.toLowerCase();
  for (const [key, value] of Object.entries(glossaryMap)) {
    if (key.toLowerCase() === lowerTerm) {
      return value;
    }
  }
  
  // Return original if no translation found
  return term;
}

/**
 * Translate an array of glossary items
 * @param {Array} glossary - Array of glossary objects with abbreviation and displayName
 * @returns {Array} Translated glossary array
 */
function translateGlossaryArray(glossary) {
  if (!Array.isArray(glossary)) return glossary;
  
  return glossary.map(item => ({
    ...item,
    displayName: translateGlossary(item.displayName) || item.displayName,
    abbreviation: translateGlossary(item.abbreviation) || item.abbreviation
  }));
}

/**
 * Translate stat labels/names
 * @param {Array} labels - Array of label strings
 * @returns {Array} Translated labels
 */
function translateLabels(labels) {
  if (!Array.isArray(labels)) return labels;
  return labels.map(label => translateGlossary(label));
}

module.exports = {
  translateGlossary,
  translateGlossaryArray,
  translateLabels,
  glossaryMap
};

