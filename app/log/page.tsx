import Link from "next/link"


export default function Log() {
  let time = "";
  let newDate = new Date();
  let hour = newDate.getHours;
  let minute = newDate.getMinutes;
  let seconds = newDate.getSeconds;
  time = hour + ':' + minute + ':' + seconds;
  let currentTime = setInterval(function() {time}, 1000);
  return (
    <main>
      <h1>Enter your info below:</h1>
      
      <form action="/send-data-here" method="post">
        <label>Activity:</label>
        <br></br>
        <input type="text" id="activity" name="activity" />
        <br></br>
        <button type="submit">Clock In</button>
      </form>
    </main>
  )
}