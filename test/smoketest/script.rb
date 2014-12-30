puts "ARGS: #{ARGV}"

puts "STDIN:"
while STDIN.gets
  puts $_
end

puts "ENV:"
puts "FOO = #{ENV['FOO']}"
puts "input_env = #{ENV['input_env']}"

puts "FILE:"
File.open("./input.txt", "r") do |f|
  puts f.read
end

File.open("./output.txt", "w") do |f|
  f.write("some output written by script.py\nline break\n")
end
