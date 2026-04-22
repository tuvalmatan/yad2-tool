# יד2 — כלי חיפוש רכבים 🏍🛵🚗

כלי מקצועי לחיפוש, סינון, מעקב והתראות על מודעות רכבים ביד2.
**הפיצ'ר שיד2 שברו: סינון לפי דרגת רישיון A / A1 / A2**

---

## פריסה על Render (חינמי, 5 דקות)

### שלב 1 — העלאה ל-GitHub

1. היכנס ל-github.com → New repository
2. שם: yad2-tool | סמן Private → Create
3. בטרמינל:

    cd yad2-tool
    git init
    git add .
    git commit -m "first commit"
    git remote add origin https://github.com/YOUR_USERNAME/yad2-tool.git
    git push -u origin main

חלופה בלי git: ב-GitHub לחץ "uploading an existing file" וגרור את כל התיקייה

---

### שלב 2 — פריסה על Render

1. היכנס ל-render.com → Sign up with GitHub (חינמי, ללא כרטיס אשראי)
2. New + → Web Service → בחר yad2-tool
3. הגדרות:
   - Build Command:  npm install
   - Start Command:  node server/index.js
   - Instance Type:  Free
4. Create Web Service → המתן ~2 דקות

תקבל URL כמו: https://yad2-tool.onrender.com

---

## הפעלה מקומית

    npm install
    npm start
    # פתח: http://localhost:3000

---

## פיצ'רים

- חיפוש מתקדם: קטגוריה / יצרן / דגם / שנה / מחיר / קמ
- סינון דרגת רישיון A / A1 / A2 (לא קיים ביד2!)
- התראות אוטומטיות — בדיקה כל 10 דקות
- מעקב מחירים — גרף היסטוריה לכל מודעה
- ייצוא CSV/Excel עם עברית תקינה

---

## הערה: Render Free

- השרת נרדם אחרי 15 דקות חוסר פעילות (טעינה ראשונה ~30 שנ')
- נתוני התראות/היסטוריה לא נשמרים לצמיתות בין restarts
- לנתונים קבועים — אוסיף MongoDB Atlas בקלות אם תצטרך
