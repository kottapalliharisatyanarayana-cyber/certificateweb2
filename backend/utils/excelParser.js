const xlsx = require('xlsx');

// Standard known student fields aliases
const ROLL_ALIASES = ['roll no', 'rollno', 'roll_no', 'roll number', 'reg no', 'regno', 'reg_no', 'registration no', 'registration number', 'htno', 'hall ticket'];
const NAME_ALIASES = ['name', 'student name', 'full name', 'candidate name', 'participant name'];
const EMAIL_ALIASES = ['email', 'email id', 'email_id', 'mail', 'student email'];
const SEM_ALIASES = ['semester', 'sem', 'year/sem', 'academic year'];
const BRANCH_ALIASES = ['branch', 'department', 'dept', 'course'];
const POSITION_ALIASES = [
  'position', 'pos', 'rank', 'prize', 'place', 'won', 'award', 'award/prize',
  'won position', 'prize won', 'standing', 'secured', 'place won', 'merit',
  'position secured', 'rank secured', 'achievement', 'result', 'category'
];
const EVENT_NAME_ALIASES = ['event', 'event name', 'event_name', 'competition', 'activity', 'contest'];

const normalizeHeader = (header) => {
  return String(header || '').trim().toLowerCase().replace(/[\s_-]+/g, ' ');
};

const formatPosition = (val) => {
  if (val === null || val === undefined) return '';
  let str = String(val).trim();
  if (!str) return '';

  // If pure number like 1, 2, 3, 4, 5, etc., convert to 1st, 2nd, 3rd, 4th, 5th
  if (/^\d+$/.test(str)) {
    const num = parseInt(str, 10);
    const j = num % 10;
    const k = num % 100;
    if (j === 1 && k !== 11) return `${num}st`;
    if (j === 2 && k !== 12) return `${num}nd`;
    if (j === 3 && k !== 13) return `${num}rd`;
    return `${num}th`;
  }

  return str;
};

const isPositionValue = (val) => {
  if (val === null || val === undefined) return false;
  const str = String(val).trim().toLowerCase();
  if (!str) return false;
  if (/^\d+$/.test(str)) {
    const n = parseInt(str, 10);
    return n >= 1 && n <= 100;
  }
  return /^(1st|2nd|3rd|4th|\d+(st|nd|rd|th)|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|winner|runner[\s-]?up|champion|consolation|merit)/i.test(str) ||
         /(prize|place|position|rank|winner|runner|place won|standing)/i.test(str);
};

const isParticipatedValue = (val) => {
  if (val === null || val === undefined) return false;
  const str = String(val).trim().toLowerCase();
  return ['yes', 'y', '1', 'true', 'participated', 'attended', 'present', 'winner', 'runner', 'p'].includes(str) || isPositionValue(val);
};

const parseExcelBuffer = (buffer) => {
  const workbook = xlsx.read(buffer, { type: 'buffer' });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new Error('The uploaded Excel file contains no worksheets.');
  }

  const worksheet = workbook.Sheets[firstSheetName];
  // Parse rows as raw JSON objects
  const rawRows = xlsx.utils.sheet_to_json(worksheet, { defval: '' });

  if (!rawRows || rawRows.length === 0) {
    throw new Error('The uploaded Excel sheet contains no data rows.');
  }

  // Identify column mapping from the keys of the first row
  const headers = Object.keys(rawRows[0]);
  let rollKey = null;
  let nameKey = null;
  let emailKey = null;
  let semKey = null;
  let branchKey = null;
  let positionKey = null;
  let singleEventKey = null;
  const eventKeys = [];

  for (const h of headers) {
    const norm = normalizeHeader(h);
    if (!rollKey && ROLL_ALIASES.includes(norm)) {
      rollKey = h;
    } else if (!nameKey && NAME_ALIASES.includes(norm)) {
      nameKey = h;
    } else if (!emailKey && EMAIL_ALIASES.includes(norm)) {
      emailKey = h;
    } else if (!semKey && SEM_ALIASES.includes(norm)) {
      semKey = h;
    } else if (!branchKey && BRANCH_ALIASES.includes(norm)) {
      branchKey = h;
    } else if (!positionKey && POSITION_ALIASES.includes(norm)) {
      positionKey = h;
    } else if (!singleEventKey && EVENT_NAME_ALIASES.includes(norm)) {
      singleEventKey = h;
    } else {
      // Any other non-empty column is treated as a potential event
      if (h.trim().length > 0) {
        eventKeys.push(h);
      }
    }
  }

  if (!rollKey) {
    throw new Error('Could not find a Roll Number column. Expected headers like "Roll No", "Roll Number", or "Reg No".');
  }
  if (!nameKey) {
    throw new Error('Could not find a Student Name column. Expected headers like "Name" or "Student Name".');
  }

  const validRecords = [];
  const invalidRecords = [];
  const seenRolls = new Set();
  const allDetectedEvents = new Set();

  rawRows.forEach((row, index) => {
    const rowNum = index + 2; // Excel 1-based index (header is row 1)
    const rawRoll = String(row[rollKey] || '').trim();
    const rawName = String(row[nameKey] || '').trim();
    const rawEmail = emailKey ? String(row[emailKey] || '').trim() : '';
    const rawSem = semKey ? String(row[semKey] || '').trim() : '';
    const rawBranch = branchKey ? String(row[branchKey] || '').trim() : '';
    const rawPos = formatPosition(positionKey ? String(row[positionKey] || '').trim() : '');

    const errors = [];

    if (!rawRoll) {
      errors.push('Missing Roll Number');
    }
    if (!rawName) {
      errors.push('Missing Student Name');
    }

    const rollUpper = rawRoll.toUpperCase();

    if (rawRoll && seenRolls.has(rollUpper)) {
      errors.push(`Duplicate Roll Number in file: ${rollUpper}`);
    }

    // Extract participated events and positions for this student
    const participatedEvents = [];
    const eventPositions = {};

    // 1. If single dedicated event column exists
    if (singleEventKey && String(row[singleEventKey] || '').trim()) {
      const evtVal = String(row[singleEventKey] || '').trim();
      participatedEvents.push(evtVal);
      eventPositions[evtVal] = rawPos || '1st Prize';
      allDetectedEvents.add(evtVal);
    }

    // 2. Multi-column event format (e.g. Coding Contest, Paper Presentation)
    eventKeys.forEach((evtHeader) => {
      const val = row[evtHeader];
      if (isParticipatedValue(val)) {
        const evtName = evtHeader.trim();
        participatedEvents.push(evtName);
        allDetectedEvents.add(evtName);
        if (isPositionValue(val)) {
          eventPositions[evtName] = String(val).trim();
        } else if (rawPos) {
          eventPositions[evtName] = rawPos;
        }
      }
    });

    if (errors.length > 0) {
      invalidRecords.push({
        row: rowNum,
        roll_no: rawRoll,
        name: rawName,
        errors
      });
    } else {
      seenRolls.add(rollUpper);
      validRecords.push({
        roll_no: rollUpper,
        name: rawName,
        email: rawEmail,
        semester: rawSem || 'IV Semester',
        branch: rawBranch || 'CSE',
        position: rawPos,
        events: participatedEvents,
        eventPositions
      });
    }
  });

  const finalEventsList = Array.from(allDetectedEvents);

  return {
    headers,
    detectedFields: {
      roll_no: rollKey,
      name: nameKey,
      email: emailKey,
      semester: semKey,
      branch: branchKey,
      position: positionKey,
      single_event: singleEventKey,
      events: eventKeys
    },
    totalRows: rawRows.length,
    validRecords,
    invalidRecords,
    detectedEvents: finalEventsList.length > 0 ? finalEventsList : eventKeys
  };
};

module.exports = {
  parseExcelBuffer,
  isParticipatedValue,
  isPositionValue,
  formatPosition
};
