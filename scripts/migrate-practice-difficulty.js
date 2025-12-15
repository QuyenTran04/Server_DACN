/**
 * Migration script để chuyển đổi mức độ từ tiếng Anh sang tiếng Việt
 * Chạy: node server/scripts/migrate-practice-difficulty.js
 */

const mongoose = require('mongoose');
require('dotenv').config({ path: './server/.env' });

const Practice = require('../src/models/Practice');

const DIFFICULTY_MAPPING = {
  'easy': 'Dễ',
  'medium': 'Trung bình',
  'hard': 'Khó',
  'very_hard': 'Rất Khó',
  'very hard': 'Rất Khó'
};

async function migrateDifficulty() {
  try {
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/your-db');
    console.log('✅ Connected to MongoDB');

    console.log('\n📊 Checking existing practices...');
    const allPractices = await Practice.find({});
    console.log(`Found ${allPractices.length} practices`);

    let migratedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const practice of allPractices) {
      const oldDifficulty = practice.difficulty;
      
      // Nếu đã là tiếng Việt, bỏ qua
      if (['Dễ', 'Trung bình', 'Khó', 'Rất Khó'].includes(oldDifficulty)) {
        skippedCount++;
        continue;
      }

      // Chuyển đổi
      const newDifficulty = DIFFICULTY_MAPPING[oldDifficulty.toLowerCase()] || 'Trung bình';
      
      try {
        await Practice.findByIdAndUpdate(practice._id, {
          $set: { difficulty: newDifficulty }
        });
        
        console.log(`✅ Migrated: ${practice._id} | ${oldDifficulty} → ${newDifficulty}`);
        migratedCount++;
      } catch (err) {
        console.error(`❌ Error migrating ${practice._id}:`, err.message);
        errorCount++;
      }
    }

    console.log('\n📈 Migration Summary:');
    console.log(`   ✅ Migrated: ${migratedCount}`);
    console.log(`   ⏭️  Skipped: ${skippedCount}`);
    console.log(`   ❌ Errors: ${errorCount}`);
    console.log(`   📊 Total: ${allPractices.length}`);

    console.log('\n✨ Migration completed!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// Chạy migration
migrateDifficulty();
