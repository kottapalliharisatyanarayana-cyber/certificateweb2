const xlsx = require('xlsx');

const generateSampleExcel = () => {
  const data = [
    {
      'Roll No': '22A81A0501',
      'Name': 'Aarav Sharma',
      'Email': 'aarav.sharma@example.com',
      'Semester': 'IV Semester B.Tech',
      'Branch': 'CSE',
      'Engineers Day': 'Yes',
      'Tech Trifecta': 'Yes',
      'Coding Challenge': 'No',
      'Quiz Competition': 'Yes'
    },
    {
      'Roll No': '22A81A0502',
      'Name': 'Bhavya Patel',
      'Email': 'bhavya.patel@example.com',
      'Semester': 'IV Semester B.Tech',
      'Branch': 'ECE',
      'Engineers Day': 'Yes',
      'Tech Trifecta': 'No',
      'Coding Challenge': 'Yes',
      'Quiz Competition': 'No'
    },
    {
      'Roll No': '22A81A0503',
      'Name': 'Chirag Reddy',
      'Email': 'chirag.reddy@example.com',
      'Semester': 'IV Semester B.Tech',
      'Branch': 'CSE-AIML',
      'Engineers Day': 'Yes',
      'Tech Trifecta': 'Yes',
      'Coding Challenge': 'Yes',
      'Quiz Competition': 'Yes'
    },
    {
      'Roll No': '22A81A0504',
      'Name': 'Divya Sri',
      'Email': 'divya.sri@example.com',
      'Semester': 'IV Semester B.Tech',
      'Branch': 'IT',
      'Engineers Day': 'No',
      'Tech Trifecta': 'Yes',
      'Coding Challenge': 'No',
      'Quiz Competition': 'Yes'
    },
    {
      'Roll No': '22A81A0505',
      'Name': 'Eshwar Verma',
      'Email': 'eshwar.verma@example.com',
      'Semester': 'IV Semester B.Tech',
      'Branch': 'Mechanical',
      'Engineers Day': 'Yes',
      'Tech Trifecta': 'No',
      'Coding Challenge': 'No',
      'Quiz Competition': 'No'
    }
  ];

  const ws = xlsx.utils.json_to_sheet(data);

  // Set column widths
  ws['!cols'] = [
    { wch: 15 }, // Roll No
    { wch: 22 }, // Name
    { wch: 28 }, // Email
    { wch: 20 }, // Semester
    { wch: 15 }, // Branch
    { wch: 16 }, // Engineers Day
    { wch: 16 }, // Tech Trifecta
    { wch: 18 }, // Coding Challenge
    { wch: 18 }  // Quiz Competition
  ];

  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, ws, 'Participants');

  return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
};

const generateSampleCoordinatorsExcel = () => {
  const data = [
    {
      'Roll No': '22A81A0501',
      'Name': 'Aarav Sharma',
      'Branch': 'CSE',
      'Semester': 'IV Semester B.Tech',
      'Coordinator Designation': 'Student Coordinator',
      'Email': 'aarav.sharma@example.com'
    },
    {
      'Roll No': '22A81A0502',
      'Name': 'Bhavya Sri',
      'Branch': 'AIML',
      'Semester': 'IV Semester B.Tech',
      'Coordinator Designation': 'Lead Event Coordinator',
      'Email': 'bhavya.sri@example.com'
    },
    {
      'Roll No': '22A81A0503',
      'Name': 'Chaitanya Varma',
      'Branch': 'ECE',
      'Semester': 'IV Semester B.Tech',
      'Coordinator Designation': 'Technical Coordinator',
      'Email': 'chaitanya.v@example.com'
    },
    {
      'Roll No': '22A81A0504',
      'Name': 'Divya Jyothi',
      'Branch': 'IT',
      'Semester': 'IV Semester B.Tech',
      'Coordinator Designation': 'Organizing Committee Lead',
      'Email': 'divya.j@example.com'
    },
    {
      'Roll No': '22A81A0505',
      'Name': 'Eshwar Prasad',
      'Branch': 'Mechanical',
      'Semester': 'IV Semester B.Tech',
      'Coordinator Designation': 'Student Coordinator',
      'Email': 'eshwar.p@example.com'
    }
  ];

  const ws = xlsx.utils.json_to_sheet(data);

  // Set column widths
  ws['!cols'] = [
    { wch: 15 }, // Roll No
    { wch: 22 }, // Name
    { wch: 16 }, // Branch
    { wch: 22 }, // Semester
    { wch: 28 }, // Coordinator Designation
    { wch: 28 }  // Email
  ];

  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, ws, 'Coordinators');

  return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
};

const generateSampleAppreciationExcel = () => {
  const data = [
    {
      'Roll No': '22A81A0501',
      'Name': 'Aarav Sharma',
      'Branch': 'CSE',
      'Semester': 'IV Semester B.Tech',
      'Position': '1st',
      'Event': 'Nexus 2K26 - Technical Symposium',
      'Email': 'aarav.sharma@example.com'
    },
    {
      'Roll No': '22A81A0502',
      'Name': 'Bhavya Sri',
      'Branch': 'AIML',
      'Semester': 'IV Semester B.Tech',
      'Position': '2nd',
      'Event': 'Nexus 2K26 - Technical Symposium',
      'Email': 'bhavya.sri@example.com'
    },
    {
      'Roll No': '22A81A0503',
      'Name': 'Chaitanya Varma',
      'Branch': 'ECE',
      'Semester': 'IV Semester B.Tech',
      'Position': '3rd',
      'Event': 'Nexus 2K26 - Technical Symposium',
      'Email': 'chaitanya.v@example.com'
    },
    {
      'Roll No': '22A81A0504',
      'Name': 'Divya Jyothi',
      'Branch': 'IT',
      'Semester': 'IV Semester B.Tech',
      'Position': '4th',
      'Event': 'Nexus 2K26 - Technical Symposium',
      'Email': 'divya.j@example.com'
    },
    {
      'Roll No': '22A81A0505',
      'Name': 'Eshwar Prasad',
      'Branch': 'Mechanical',
      'Semester': 'IV Semester B.Tech',
      'Position': '5th',
      'Event': 'Nexus 2K26 - Technical Symposium',
      'Email': 'eshwar.p@example.com'
    }
  ];

  const ws = xlsx.utils.json_to_sheet(data);

  ws['!cols'] = [
    { wch: 15 }, // Roll No
    { wch: 24 }, // Name
    { wch: 16 }, // Branch
    { wch: 12 }, // Semester
    { wch: 16 }, // Position
    { wch: 34 }, // Event
    { wch: 26 }  // Email
  ];

  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, ws, 'Winners_Appreciation');

  return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
};

module.exports = {
  generateSampleExcel,
  generateSampleCoordinatorsExcel,
  generateSampleAppreciationExcel
};

