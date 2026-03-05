# frozen_string_literal: true

require 'dotenv'
Dotenv.load

# Load all rake tasks from tasks/ directory
Dir.glob('tasks/**/*.rake').each { |r| load r }

desc 'Default: list available tasks'
task default: :list

desc 'List all available tasks'
task :list do
  puts "\n📧 Postmark Templates V3 – Available Tasks\n"
  puts '=' * 50
  Rake::Task.tasks.each do |task|
    next if task.name == 'list' || task.name == 'default'
    puts "  rake #{task.name.ljust(35)} # #{task.comment || 'No description'}"
  end
  puts "\n"
end
