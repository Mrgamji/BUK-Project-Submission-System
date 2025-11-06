const bcrypt = require('bcryptjs');
const { supabase } = require('../config/database');

async function seedDatabase() {
  console.log('Starting database seeding...');

  try {
    const hashedPassword = await bcrypt.hash('password123', 10);

    const { data: adminUser, error: adminError } = await supabase
      .from('users')
      .insert({
        email: 'admin@example.com',
        password_hash: hashedPassword,
        full_name: 'General Admin',
        role: 'general_admin'
      })
      .select()
      .single();

    if (adminError && !adminError.message.includes('duplicate')) {
      console.error('Error creating admin:', adminError);
    } else {
      console.log('Created General Admin user');
    }

    const { data: coordinator, error: coordError } = await supabase
      .from('users')
      .insert({
        email: 'coordinator@example.com',
        password_hash: hashedPassword,
        full_name: 'Level Coordinator',
        role: 'level_coordinator',
        level: '400'
      })
      .select()
      .single();

    if (coordError && !coordError.message.includes('duplicate')) {
      console.error('Error creating coordinator:', coordError);
    } else {
      console.log('Created Level Coordinator user');
    }

    const { data: hod, error: hodError } = await supabase
      .from('users')
      .insert({
        email: 'hod@example.com',
        password_hash: hashedPassword,
        full_name: 'HOD Computer Science',
        role: 'hod',
        department: 'Computer Science'
      })
      .select()
      .single();

    if (hodError && !hodError.message.includes('duplicate')) {
      console.error('Error creating HOD:', hodError);
    } else {
      console.log('Created HOD user');
    }

    const { data: supervisor, error: supError } = await supabase
      .from('users')
      .insert({
        email: 'supervisor@example.com',
        password_hash: hashedPassword,
        full_name: 'Dr. John Smith',
        role: 'supervisor',
        department: 'Computer Science'
      })
      .select()
      .single();

    if (supError && !supError.message.includes('duplicate')) {
      console.error('Error creating supervisor:', supError);
    } else {
      console.log('Created Supervisor user');
    }

    const { data: student, error: studentError } = await supabase
      .from('users')
      .insert({
        email: 'student@example.com',
        password_hash: hashedPassword,
        full_name: 'John Doe',
        role: 'student',
        department: 'Computer Science',
        level: '400'
      })
      .select()
      .single();

    if (studentError && !studentError.message.includes('duplicate')) {
      console.error('Error creating student:', studentError);
    } else {
      console.log('Created Student user');
    }

    console.log('\nSample users created:');
    console.log('Admin: admin@example.com / password123');
    console.log('Coordinator: coordinator@example.com / password123');
    console.log('HOD: hod@example.com / password123');
    console.log('Supervisor: supervisor@example.com / password123');
    console.log('Student: student@example.com / password123');
    console.log('\nDatabase seeding completed!');
  } catch (error) {
    console.error('Seeding error:', error);
  }
}

seedDatabase();
