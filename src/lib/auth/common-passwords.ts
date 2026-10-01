/**
 * AUTH-02 (decision D-4): passwords too common to allow. Only entries of 12 or
 * more characters matter, because shorter ones fail the length rule anyway.
 * Matching ignores letter case and spaces.
 *
 * This is a hand-written starter list. The plan (T-03) replaces it with one
 * derived from SecLists' most-common-passwords file (MIT), once the owner
 * agrees to the download.
 */
const LIST = `
123456789012 1234567890123 12345678901234 123456789123 111111111111 000000000000 123123123123 121212121212
112233445566 987654321098 098765432109 147258369147 123412341234 abcd12345678 abc123456789 a1b2c3d4e5f6
password1234 password12345 password123456 password2024 password2025 password2026 passwordpassword mypassword123
qwertyuiopas qwertyuiop12 qwerty123456 qwertyqwerty 1qaz2wsx3edc 1q2w3e4r5t6y zaq12wsxcde3 asdfghjkl123
iloveyou1234 iloveyouforever letmein12345 welcome12345 welcome123456 changeme1234 administrator admin1234567
adminadmin12 football1234 baseball1234 sunshine1234 princess1234 starwars1234 superman1234 batman123456
monkey123456 dragon123456 master123456 trustno1trustno1 whatever1234 computer1234 internet1234 bangladesh123
bangladesh1234 dhaka1234567 dhakacity123 pundrauniversity pundra123456 pundra12345678 cseteacher123 teacher12345
teacher123456 university123 university1234 student123456 lecturer1234 qwertyuiopasdfgh abcdefghijkl abcdefghijklm
aaaaaaaaaaaa zxcvbnm12345 zxcvbnmasdfg passw0rd1234 p@ssw0rd1234 p@ssword1234 pa55word1234 correcthorsebatterystaple
`;

export const COMMON_PASSWORDS: ReadonlySet<string> = new Set(LIST.trim().split(/\s+/).map((entry) => entry.toLowerCase()));
