DROP POLICY IF EXISTS "Blog media public read" ON storage.objects;
CREATE POLICY "Blog media admin read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'blog-media' AND public.has_role(auth.uid(), 'admin'));