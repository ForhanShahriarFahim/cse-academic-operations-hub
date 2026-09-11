import assert from "node:assert/strict";
import { attendanceMark, parseStudentCsv } from "../src/lib/attendance";
import { amountInWords, isExtraLoadEligible, paymentForClasses } from "../src/lib/extra-load";

const roster = parseStudentCsv(`STUDENT'S ID,STUDENT'S NAME,PHONE NUMBER,Department,Audience Type
0322320205101068,Mst. Antana Fahmida,01819946506,CSE,local
EXT-EEE-001,"Example, External Student",01700000000,EEE,merged`);

assert.equal(roster.length, 2);
assert.equal(roster[0].studentCode, "0322320205101068");
assert.equal(roster[1].fullName, "Example, External Student");
assert.equal(roster[1].audienceType, "merged");

assert.equal(attendanceMark(["present", "late", "absent", "excused"], 10), 6.67);
assert.equal(attendanceMark(["present", "absent"], 5), 2.5);
assert.equal(attendanceMark(["excused"], 10), 0);

assert.equal(isExtraLoadEligible(15, 15), false);
assert.equal(isExtraLoadEligible(15.01, 15), true);
assert.equal(paymentForClasses(4, 200), 800);
assert.equal(paymentForClasses(4, 200, 750), 750);
assert.equal(amountInWords(800), "Eight Hundred taka only");
assert.equal(amountInWords(125_600), "One Lakh Twenty-Five Thousand Six Hundred taka only");

console.log("Domain verification passed: CSV, attendance, eligibility, payment, and amount wording.");
