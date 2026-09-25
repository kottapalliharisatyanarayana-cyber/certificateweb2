const { PDFParse } = require('pdf-parse');

const parsePdfBuffer = async (buffer) => {
  const parser = new PDFParse(new Uint8Array(buffer));
  await parser.load();
  const textObj = await parser.getText();
  const fullText = (textObj && textObj.text) ? textObj.text : '';
  const numPages = (textObj && textObj.pages) ? textObj.pages.length : 1;

  const lines = fullText
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.length > 0);

  // 1. Try to detect Event title from document header
  let detectedEvent = '';
  for (const line of lines.slice(0, 15)) {
    const match = line.match(/(?:event|title|topic|competition|symposium|workshop)\s*[:=-]\s*([^\n\r]+)/i);
    if (match && match[1].trim()) {
      detectedEvent = match[1].trim().replace(/\s+(date|venue|time).*$/i, '').trim();
      break;
    }
  }

  // 2. Identify candidate lines containing Roll Numbers
  const rollRegex = /\b([0-9]{2}[A-Za-z][0-9]{2}[A-Za-z0-9]{4,6}|[0-9]{2}[A-Za-z0-9]{7,9})\b/;
  const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/;
  const branchRegex = /\b(CSE(?:-AIML|-DS|-CS)?|ECE|EEE|MECH(?:ANICAL)?|CIVIL|IT|AIML|AI&ML|AIDS|CSBS|MCA|MBA)\b/i;
  const semRegex = /\b((?:IV|VI|VIII|II|I|III|V|VII|[1-8](?:st|nd|rd|th)?)\s*(?:Sem(?:ester)?)?(?:\s*B\.?Tech)?)\b/i;

  const validParticipants = [];
  const seenRolls = new Set();

  for (const line of lines) {
    // Skip common header/footer lines
    if (/^(roll\s*no|student\s*name|s\.?no|sl\.?no|page\s*\d+|certified\s*that|authorized|signature|--)/i.test(line)) {
      continue;
    }

    const rollMatch = line.match(rollRegex);
    if (!rollMatch) continue;

    const roll_no = rollMatch[1].toUpperCase();
    if (seenRolls.has(roll_no)) continue;

    // Extract email
    let email = '';
    const emailMatch = line.match(emailRegex);
    if (emailMatch) email = emailMatch[1].toLowerCase();

    // Extract branch
    let branch = 'CSE';
    const branchMatch = line.match(branchRegex);
    if (branchMatch) branch = branchMatch[1].toUpperCase();

    // Extract semester
    let semester = 'IV Semester B.Tech';
    const semMatch = line.match(semRegex);
    if (semMatch) semester = semMatch[1];

    // Extract student name
    let remaining = line
      .replace(rollMatch[0], ' ')
      .replace(email || '', ' ')
      .replace(branchMatch ? branchMatch[0] : '', ' ')
      .replace(semMatch ? semMatch[0] : '', ' ')
      .replace(/^[0-9]+[.\s)]*/, ' ')
      .replace(/[|,\t]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    let name = remaining.replace(/[^a-zA-Z\s.]/g, '').trim();
    if (name.length < 2) {
      name = `Student ${roll_no}`;
    }

    seenRolls.add(roll_no);
    validParticipants.push({
      roll_no,
      name,
      email,
      branch,
      semester
    });
  }

  return {
    numPages,
    detectedEvent: detectedEvent || 'Robotics & AI Symposium',
    participants: validParticipants,
    totalExtracted: validParticipants.length
  };
};

module.exports = {
  parsePdfBuffer
};
