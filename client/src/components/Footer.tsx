export default function Footer() {
  return (
    <footer className="py-6 px-6 md:px-10 text-center text-neutral-500 text-sm">
      <div className="max-w-5xl mx-auto">
        <div className="mb-4">
          <p>LyreCloud Teams &copy; {new Date().getFullYear()}. All rights reserved.</p>
        </div>
        <div className="flex justify-center space-x-6">
          <a href="#" className="hover:text-primary">Terms</a>
          <a href="#" className="hover:text-primary">Privacy</a>
          <a href="#" className="hover:text-primary">Help</a>
          <a href="#" className="hover:text-primary">Contact</a>
        </div>
      </div>
    </footer>
  );
}
