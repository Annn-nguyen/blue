import ReminderController from "../controllers/reminderController";
import dotenv from 'dotenv';

dotenv.config();

// Replace with a real psid for testing
const psid = process.argv[2] || "30269957119315952";

ReminderController.genQuiz(psid)
  .then(() => {
    console.log("genQuiz finished");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Error running genQuiz:", err);
    process.exit(1);
  });